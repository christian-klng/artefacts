import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { projects, projectBackups, appUsers, attachments } from "@/lib/db/schema";
import {
  snapshotFilesMap,
  restoreFilesFromMap,
  getClientFiles,
  readFile,
  isSlugFree,
  type SnapshotEntry,
  type ClientFiles,
} from "@/lib/projects";
import {
  dumpTenantData,
  dropTenantSchema,
  ensureProvisioned,
  applyOwnerSecurity,
  restoreTenantData,
} from "@/lib/appdb/provision";
import { applyTenantDdl } from "@/lib/appdb/exec";
import { serializeTenantDump } from "@/lib/appdb/dump";
import { settingNumber } from "@/lib/settings";

// Full-app backup: the WHOLE project state as one self-contained JSON blob —
// files + per-project DB (schema DDL + serialized data) + generated-app end-user
// accounts + attachments + project settings. Replaces the file-only
// artifact_version system as the single snapshot/restore mechanism. See the
// project_backup table (lib/db/schema.ts) and the plan in CLAUDE.md's backup
// section.

export type BackupKind = "auto" | "daily" | "publish" | "manual";

// createdAt is a Date when built, a string after JSON round-trip → accept both;
// restore wraps it back into a Date before re-inserting.
type BackupAppUser = {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  createdAt: string | Date;
};
type BackupAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  kind: string;
  size: number;
  dataBase64: string;
  extractedText: string | null;
  createdAt: string | Date;
};
type BackupSettings = {
  name: string;
  publishSlug: string | null;
  siteUrl: string | null;
  databaseEnabled: boolean;
  dbProvisionedAt: string | Date | null;
  badgeHidden: boolean;
  published: boolean;
};

export type BackupBlob = {
  version: 1;
  // FILES — exactly snapshotFilesMap()'s shape, so publish reads stay byte-
  // compatible with the legacy artifact_version snapshot.
  files: Record<string, SnapshotEntry>;
  // DB — present only when the project had a database at backup time. `ddl` is
  // the /database.sql text (also in `files`, pinned here so restore never
  // depends on file iteration order); `dataSql` is serializeTenantDump output.
  db: { ddl: string; dataSql: string } | null;
  appUsers: BackupAppUser[];
  attachments: BackupAttachment[];
  settings: BackupSettings;
};

// Hard cap on retained per-turn 'auto' backups per project, on top of the day
// window — a busy build day can produce dozens of full backups, and 'auto'
// points rarely need to go back more than a handful of turns.
const AUTO_KEEP = 20;

/**
 * Snapshots the entire app as a new backup row, then prunes old ones. Reads the
 * DB dump + attachments + app_user rows only as needed. Not wrapped in one
 * transaction: the tenant dump uses its own admin connection, and a concurrent
 * edit mid-snapshot just yields a slightly newer files section (acceptable).
 */
export async function createBackup(
  projectId: string,
  kind: BackupKind,
  label?: string,
) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) throw new Error("Project not found");

  const files = await snapshotFilesMap(projectId);

  let dbSection: BackupBlob["db"] = null;
  if (project.databaseEnabled) {
    const dump = await dumpTenantData(projectId);
    const dataSql = serializeTenantDump(dump);
    const ddl = (await readFile(projectId, "/database.sql")) ?? "";
    dbSection = { ddl, dataSql };
  }

  const users = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.projectId, projectId));
  const atts = await db
    .select()
    .from(attachments)
    .where(eq(attachments.projectId, projectId));

  const blob: BackupBlob = {
    version: 1,
    files,
    db: dbSection,
    appUsers: users.map((u) => ({
      id: u.id,
      email: u.email,
      passwordHash: u.passwordHash,
      name: u.name,
      createdAt: u.createdAt,
    })),
    attachments: atts.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      kind: a.kind,
      size: a.size,
      dataBase64: a.dataBase64,
      extractedText: a.extractedText,
      createdAt: a.createdAt,
    })),
    settings: {
      name: project.name,
      publishSlug: project.publishSlug,
      siteUrl: project.siteUrl,
      databaseEnabled: project.databaseEnabled,
      dbProvisionedAt: project.dbProvisionedAt,
      badgeHidden: project.badgeHidden,
      published: project.published,
    },
  };

  const [row] = await db
    .insert(projectBackups)
    .values({ projectId, kind, label: label ?? null, data: JSON.stringify(blob) })
    .returning({
      id: projectBackups.id,
      kind: projectBackups.kind,
      label: projectBackups.label,
      createdAt: projectBackups.createdAt,
    });

  await pruneBackups(projectId);
  return row;
}

/** Backup list for the UI (no blob). Newest first. */
export async function listBackups(projectId: string) {
  return db
    .select({
      id: projectBackups.id,
      kind: projectBackups.kind,
      label: projectBackups.label,
      createdAt: projectBackups.createdAt,
    })
    .from(projectBackups)
    .where(eq(projectBackups.projectId, projectId))
    .orderBy(desc(projectBackups.createdAt));
}

/**
 * Restores the WHOLE app from a backup. Order is riskiest-first (DB), each step
 * idempotent/re-runnable. NO cross-store rollback — the invariant that makes it
 * unnecessary is that a published project keeps serving its FROZEN backup
 * (publishedBackupId, independent of live files/DB) throughout, so the public
 * app never shows a half-restored state. Restoring live state does NOT
 * republish — `published`/`publishedBackupId` are left untouched.
 */
export async function restoreBackup(
  projectId: string,
  backupId: string,
): Promise<ClientFiles & { databaseEnabled: boolean }> {
  const row = await db.query.projectBackups.findFirst({
    where: and(
      eq(projectBackups.id, backupId),
      eq(projectBackups.projectId, projectId),
    ),
  });
  if (!row) throw new Error("Backup not found");
  const blob = JSON.parse(row.data) as BackupBlob;

  // 1. Database — schema is admin-owned, so drop + re-provision run as admin.
  if (blob.db) {
    await dropTenantSchema(projectId);
    const names = await ensureProvisioned(projectId); // recreates schema + grants
    await applyTenantDdl(pool, names, blob.db.ddl); // tables under the tenant role
    await restoreTenantData(projectId, blob.db.dataSql); // rows (admin, RLS off)
    await applyOwnerSecurity(projectId); // re-assert owner_id default + FORCE RLS
  } else {
    // Backup had no DB: drop any current schema so the restored app matches it.
    await dropTenantSchema(projectId);
  }

  // 2. Files (delete-all + re-insert). Also restores /database.sql.
  await restoreFilesFromMap(projectId, blob.files);

  // 3. End-user accounts + attachments (control-plane → one transaction).
  //    Preserve original ids + createdAt so app session tokens and owner_id
  //    references stay valid after restore.
  await db.transaction(async (tx) => {
    await tx.delete(appUsers).where(eq(appUsers.projectId, projectId));
    if (blob.appUsers.length) {
      await tx.insert(appUsers).values(
        blob.appUsers.map((u) => ({
          id: u.id,
          projectId,
          email: u.email,
          passwordHash: u.passwordHash,
          name: u.name ?? null,
          createdAt: new Date(u.createdAt),
        })),
      );
    }
    await tx.delete(attachments).where(eq(attachments.projectId, projectId));
    if (blob.attachments.length) {
      await tx.insert(attachments).values(
        blob.attachments.map((a) => ({
          id: a.id,
          projectId,
          filename: a.filename,
          mimeType: a.mimeType,
          kind: a.kind,
          size: a.size,
          dataBase64: a.dataBase64,
          extractedText: a.extractedText ?? null,
          createdAt: new Date(a.createdAt),
        })),
      );
    }
  });

  // 4. Settings. Guard the slug against a conflict (would violate the unique
  //    index and abort the whole restore); keep published/publishedBackupId.
  const s = blob.settings;
  const restoreSlug =
    s.publishSlug != null && (await isSlugFree(s.publishSlug, projectId));
  await db
    .update(projects)
    .set({
      name: s.name,
      ...(restoreSlug ? { publishSlug: s.publishSlug } : {}),
      siteUrl: s.siteUrl,
      databaseEnabled: blob.db != null,
      dbProvisionedAt: blob.db
        ? s.dbProvisionedAt
          ? new Date(s.dbProvisionedAt)
          : new Date()
        : null,
      badgeHidden: s.badgeHidden,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  const client = await getClientFiles(projectId);
  return { ...client, databaseEnabled: blob.db != null };
}

/**
 * Retention: keep every backup newer than BACKUP_RETENTION_DAYS (default 7),
 * cap retained 'auto' backups at AUTO_KEEP, and ALWAYS keep the currently-
 * published backup and the newest backup overall (so an idle project keeps at
 * least one restore point and the public app never loses its frozen source).
 */
export async function pruneBackups(projectId: string): Promise<void> {
  const days = await settingNumber("BACKUP_RETENTION_DAYS", 7);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { publishedBackupId: true },
  });
  const all = await db
    .select({
      id: projectBackups.id,
      kind: projectBackups.kind,
      createdAt: projectBackups.createdAt,
    })
    .from(projectBackups)
    .where(eq(projectBackups.projectId, projectId))
    .orderBy(desc(projectBackups.createdAt));

  const keep = new Set<string>();
  if (all[0]) keep.add(all[0].id); // newest overall
  if (project?.publishedBackupId) keep.add(project.publishedBackupId);

  const toDelete: string[] = [];
  let autoSeen = 0;
  for (const b of all) {
    if (keep.has(b.id)) continue;
    if (b.kind === "auto") {
      autoSeen += 1;
      if (b.createdAt < cutoff || autoSeen > AUTO_KEEP) toDelete.push(b.id);
    } else if (b.createdAt < cutoff) {
      toDelete.push(b.id);
    }
  }
  if (toDelete.length) {
    await db
      .delete(projectBackups)
      .where(inArray(projectBackups.id, toDelete));
  }
}
