import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  files,
  messages,
  artifactVersions,
  projectBackups,
} from "@/lib/db/schema";
import { publishSlugFromLabel } from "@/lib/app-host";
import { canonicalSignatureMap, filesSignature } from "@/lib/files-signature";
import { isInternalVfsPath } from "@/lib/concept";
import { THUMBNAIL_PATH } from "@/lib/og-image";
// NOTE: lib/backup.ts imports helpers from this module; the cycle is safe
// because neither side calls the other at module top level.
import { createBackup } from "@/lib/backup";

export type FileEncoding = "utf8" | "base64";

// A snapshot entry: a plain string is legacy/text (utf8); an object carries a
// binary asset (base64 + mimeType). Lets restore/publish stay backward-compatible.
// The canonical files-section format shared by version snapshots, full backups
// (lib/backup.ts) and the published-file reads.
export type SnapshotEntry =
  | string
  | { content: string; encoding: FileEncoding; mimeType: string | null };

/** sha256 of a file's stored content — stable id for change detection. */
function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// What the client needs to render the workspace: text files in full, binary
// assets as metadata only (never ship base64 to the browser). `internal` carries
// the agent-memory files (/CONCEPT.md, /DESIGN.md) on a SEPARATE channel: shown
// read-only in the code tree so the user can read the concept/design, but kept
// out of `files`/`assets` so they never affect the preview's single-vs-multi-file
// detection or the publish-dirty signature (and never reach serve/export/publish).
export type ClientFiles = {
  files: Record<string, string>;
  assets: Record<string, { mimeType: string | null; size: number; hash: string }>;
  internal: Record<string, string>;
};

// Service layer for per-user projects and their virtual filesystem. Every read
// and write is scoped by userId/projectId, which is what enforces multi-tenant
// isolation — the agent's tools go through these functions and can never reach
// another tenant's data or the host disk.

export type ProjectFile = {
  path: string;
  content: string;
  encoding: FileEncoding;
  mimeType: string | null;
};

export async function listProjects(userId: string) {
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(asc(projects.createdAt));
}

/** Returns the user's most recent project, creating an empty one on first use. */
export async function ensureDefaultProject(userId: string) {
  const existing = await db.query.projects.findFirst({
    where: eq(projects.userId, userId),
    orderBy: [desc(projects.updatedAt), desc(projects.createdAt)],
  });
  if (existing) return existing;

  const [created] = await db
    .insert(projects)
    .values({ userId, name: "My first app" })
    .returning();
  return created;
}

export async function createProject(userId: string, name = "Untitled app") {
  const [created] = await db
    .insert(projects)
    .values({ userId, name })
    .returning();
  return created;
}

export async function renameProject(
  projectId: string,
  userId: string,
  name: string,
) {
  await db
    .update(projects)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

/**
 * System-assigned placeholder names (never user-chosen). Only these are eligible
 * to be replaced by the auto-derived <title> on a project's first build — a
 * manual rename (or a landing prompt-derived name) is always preserved.
 */
export const DEFAULT_PROJECT_NAMES = new Set([
  "Untitled app", // createProject default (project switcher)
  "My first app", // ensureDefaultProject
  "Untitled project", // DB column default
]);

export const isDefaultProjectName = (name: string): boolean =>
  DEFAULT_PROJECT_NAMES.has(name.trim());

/**
 * Extracts a project name from an HTML document's <title>: decodes the few
 * common entities, collapses whitespace, and truncates to 60 chars. Returns
 * null when there's no usable title.
 */
export function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;
  return title.length > 60 ? `${title.slice(0, 60).trimEnd()}…` : title;
}

/**
 * Stores the public URL the user plans to deploy an export under, so exported
 * SEO files get real absolute URLs. Pass null to clear. Scoped to the owner.
 */
export async function setSiteUrl(
  projectId: string,
  userId: string,
  siteUrl: string | null,
) {
  await db
    .update(projects)
    .set({ siteUrl, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

/** Deletes a project; files/messages/versions cascade via FK. */
export async function deleteProject(projectId: string, userId: string) {
  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

/** Throws if the project does not belong to the user. */
export async function getOwnedProject(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  if (!project) throw new Error("Project not found");
  return project;
}

/**
 * Flags the serve route needs to render a project's HTML: whether the DB SDK is
 * injected (`dbEnabled`) and whether the "Erstellt mit Kubikraum" badge is
 * suppressed (`badgeHidden`). One PK lookup for both.
 */
export async function getProjectServeMeta(
  projectId: string,
): Promise<{ dbEnabled: boolean; badgeHidden: boolean }> {
  const row = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { databaseEnabled: true, badgeHidden: true },
  });
  return {
    dbEnabled: row?.databaseEnabled ?? false,
    badgeHidden: row?.badgeHidden ?? false,
  };
}

export async function listFiles(projectId: string): Promise<ProjectFile[]> {
  const rows = await db
    .select({
      path: files.path,
      content: files.content,
      encoding: files.encoding,
      mimeType: files.mimeType,
    })
    .from(files)
    .where(eq(files.projectId, projectId))
    .orderBy(asc(files.path));
  return rows.map((r) => ({ ...r, encoding: r.encoding as FileEncoding }));
}

/** The client-facing split: text files in full, binary assets as metadata only. */
export async function getClientFiles(projectId: string): Promise<ClientFiles> {
  const all = await listFiles(projectId);
  const result: ClientFiles = { files: {}, assets: {}, internal: {} };
  for (const f of all) {
    // Agent-internal files (/CONCEPT.md, /DESIGN.md) ride a separate channel so
    // the user can READ them in the code tree while they stay out of the
    // shipped app: excluded from the preview, publish signature, serve, and
    // export. They are always utf8 text.
    if (isInternalVfsPath(f.path)) {
      result.internal[f.path] = f.content;
      continue;
    }
    if (f.encoding === "base64") {
      result.assets[f.path] = {
        mimeType: f.mimeType,
        size: Buffer.from(f.content, "base64").length,
        hash: contentHash(f.content),
      };
    } else {
      result.files[f.path] = f.content;
    }
  }
  return result;
}

/** Text-only read (for the agent's text tools and publish checks). */
export async function readFile(
  projectId: string,
  path: string,
): Promise<string | null> {
  const row = await db.query.files.findFirst({
    where: and(eq(files.projectId, projectId), eq(files.path, path)),
  });
  return row?.content ?? null;
}

/** Full read incl. encoding/mimeType (for serving and zipping). */
export async function readFileRaw(
  projectId: string,
  path: string,
): Promise<{ content: string; encoding: FileEncoding; mimeType: string | null } | null> {
  const row = await db.query.files.findFirst({
    where: and(eq(files.projectId, projectId), eq(files.path, path)),
  });
  if (!row) return null;
  return {
    content: row.content,
    encoding: row.encoding as FileEncoding,
    mimeType: row.mimeType,
  };
}

export async function writeFile(
  projectId: string,
  path: string,
  content: string,
): Promise<void> {
  await db
    .insert(files)
    .values({ projectId, path, content, encoding: "utf8", mimeType: null })
    .onConflictDoUpdate({
      target: [files.projectId, files.path],
      // Writing text resets a path to a text file (clears any binary encoding).
      set: { content, encoding: "utf8", mimeType: null, updatedAt: new Date() },
    });
  await touchProject(projectId);
}

/** Writes a binary asset (e.g. an embedded image/PDF) into the VFS. */
export async function writeBinaryFile(
  projectId: string,
  path: string,
  base64: string,
  mimeType: string | null,
): Promise<void> {
  await db
    .insert(files)
    .values({ projectId, path, content: base64, encoding: "base64", mimeType })
    .onConflictDoUpdate({
      target: [files.projectId, files.path],
      set: { content: base64, encoding: "base64", mimeType, updatedAt: new Date() },
    });
  await touchProject(projectId);
}

export async function editFile(
  projectId: string,
  path: string,
  oldString: string,
  newString: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await readFile(projectId, path);
  if (current === null) return { ok: false, error: `File not found: ${path}` };
  const index = current.indexOf(oldString);
  if (index === -1) {
    return { ok: false, error: `String not found in ${path}` };
  }
  if (current.indexOf(oldString, index + oldString.length) !== -1) {
    return {
      ok: false,
      error: `String is not unique in ${path}; provide more surrounding context`,
    };
  }
  const updated =
    current.slice(0, index) +
    newString +
    current.slice(index + oldString.length);
  await writeFile(projectId, path, updated);
  return { ok: true };
}

export async function deleteFile(
  projectId: string,
  path: string,
): Promise<boolean> {
  const result = await db
    .delete(files)
    .where(and(eq(files.projectId, projectId), eq(files.path, path)))
    .returning({ path: files.path });
  if (result.length > 0) await touchProject(projectId);
  return result.length > 0;
}

export async function addMessage(
  projectId: string,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  tool?: string,
  kind?: string,
) {
  const [row] = await db
    .insert(messages)
    .values({ projectId, role, content, tool, kind })
    .returning();
  return row;
}

/**
 * Rewrites a message's content in place (used to move an interview card from
 * pending → answered/skipped). Scoped by projectId — the caller's ownership
 * check on the project is what authorizes touching its messages.
 */
export async function updateMessageContent(
  messageId: string,
  projectId: string,
  content: string,
) {
  await db
    .update(messages)
    .set({ content })
    .where(and(eq(messages.id, messageId), eq(messages.projectId, projectId)));
}

export async function getMessages(projectId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.projectId, projectId))
    .orderBy(asc(messages.createdAt));
}

// --- Files snapshot helpers (shared by full backups in lib/backup.ts) ------

/**
 * The project's current files as a snapshot map { path: string | {content,
 * encoding, mimeType} } — the canonical files-section format. ONE definition,
 * reused by full backups and the published-file reads, so publish signatures
 * never drift from what a backup stores.
 */
export async function snapshotFilesMap(
  projectId: string,
): Promise<Record<string, SnapshotEntry>> {
  const all = await listFiles(projectId);
  return Object.fromEntries(
    all.map((f): [string, SnapshotEntry] => [
      f.path,
      f.encoding === "base64"
        ? { content: f.content, encoding: f.encoding, mimeType: f.mimeType }
        : f.content,
    ]),
  );
}

/**
 * Replaces ALL of a project's files with those in a snapshot map (delete-all +
 * re-insert, one transaction). Shared by full-backup restore. Does NOT bump
 * updatedAt — callers touchProject afterwards.
 */
export async function restoreFilesFromMap(
  projectId: string,
  snapshot: Record<string, SnapshotEntry>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(files).where(eq(files.projectId, projectId));
    const rows = Object.entries(snapshot).map(([path, v]) =>
      typeof v === "string"
        ? { projectId, path, content: v, encoding: "utf8", mimeType: null }
        : {
            projectId,
            path,
            content: v.content,
            encoding: v.encoding,
            mimeType: v.mimeType ?? null,
          },
    );
    if (rows.length > 0) await tx.insert(files).values(rows);
  });
}

// --- Publishing: serve a frozen snapshot publicly at <slug>.apps.<domain> ---

/** Turns a project name into a URL-safe label, never colliding with preview-*. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "") // drop non-ASCII (NFKD leaves base letters)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const cleaned = base || "app";
  // The preview-<id> host namespace is reserved for gated previews.
  return cleaned.startsWith("preview") ? `app-${cleaned}` : cleaned;
}

/** True if no other project holds this slug. */
export async function isSlugFree(
  slug: string,
  projectId: string,
): Promise<boolean> {
  const taken = await db.query.projects.findFirst({
    where: eq(projects.publishSlug, slug),
  });
  return !taken || taken.id === projectId;
}

/**
 * The clean base slug if free, otherwise `base-<random 6 digits>`. A random
 * suffix (vs. -2/-3) keeps another tenant's address un-guessable and sidesteps
 * the enumerate-and-collide race.
 */
async function uniqueSlug(base: string, projectId: string): Promise<string> {
  if (await isSlugFree(base, projectId)) return base;
  for (let i = 0; i < 20; i += 1) {
    const candidate = `${base}-${randomInt(100000, 1000000)}`;
    if (await isSlugFree(candidate, projectId)) return candidate;
  }
  throw new Error("Could not allocate a unique address; pick a custom one");
}

/**
 * Sets a user-chosen public address. Validates the shape, rejects taken slugs,
 * and (when published) moves the live app to the new URL immediately.
 */
export async function setPublishSlug(
  projectId: string,
  userId: string,
  desired: string,
): Promise<{ slug: string } | { error: string }> {
  await getOwnedProject(projectId, userId); // ownership guard
  const slug = publishSlugFromLabel(desired.trim().toLowerCase());
  if (!slug) {
    return { error: "Ungültige Adresse: nur a–z, 0–9 und Bindestriche." };
  }
  if (!(await isSlugFree(slug, projectId))) {
    return { error: "Diese Adresse ist bereits vergeben." };
  }
  await db
    .update(projects)
    .set({ publishSlug: slug, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return { slug };
}

/**
 * Publishes the project: freezes the current files as a new version and serves
 * that snapshot publicly. Reuses the existing slug on re-publish. Returns the
 * slug plus whether this was the project's very first publish (the
 * published-version pointer survives unpublish, so it marks "never published").
 */
export async function publishProject(
  projectId: string,
  userId: string,
): Promise<{ slug: string; firstPublish: boolean }> {
  const project = await getOwnedProject(projectId, userId);
  if ((await readFile(projectId, "/index.html")) == null) {
    throw new Error("Nothing to publish: no /index.html yet");
  }
  const firstPublish =
    project.publishedBackupId == null && project.publishedVersionId == null;

  // Freeze the whole app as a backup; the public app serves this snapshot.
  const backup = await createBackup(projectId, "publish", "Veröffentlicht");
  const slug =
    project.publishSlug ?? (await uniqueSlug(slugify(project.name), projectId));

  await db
    .update(projects)
    .set({
      published: true,
      publishSlug: slug,
      publishedBackupId: backup.id,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  return { slug, firstPublish };
}

/**
 * Content fingerprint of the currently published snapshot, or null if the
 * project isn't published. Compared client-side against the live files to tell
 * whether a re-publish is needed (see lib/files-signature.ts).
 */
export async function getPublishedSignature(
  projectId: string,
): Promise<string | null> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) return null;
  const filesMap = await loadPublishedFilesMap(project);
  if (!filesMap) return null;
  return filesMapSignature(filesMap);
}

/**
 * The frozen published files map, resolved from the full backup
 * (publishedBackupId) or, for apps published before the backup rework, the
 * legacy artifact_version (publishedVersionId). Null if not published / missing.
 */
async function loadPublishedFilesMap(project: {
  id: string;
  publishedBackupId: string | null;
  publishedVersionId: string | null;
}): Promise<Record<string, SnapshotEntry> | null> {
  if (project.publishedBackupId) {
    const backup = await db.query.projectBackups.findFirst({
      where: and(
        eq(projectBackups.id, project.publishedBackupId),
        eq(projectBackups.projectId, project.id),
      ),
    });
    if (backup) {
      const blob = JSON.parse(backup.data) as {
        files: Record<string, SnapshotEntry>;
      };
      return blob.files;
    }
  }
  if (project.publishedVersionId) {
    const version = await db.query.artifactVersions.findFirst({
      where: and(
        eq(artifactVersions.id, project.publishedVersionId),
        eq(artifactVersions.projectId, project.id),
      ),
    });
    if (version) {
      return JSON.parse(version.snapshot) as Record<string, SnapshotEntry>;
    }
  }
  return null;
}

/** Signature over a files map, treating binary entries as `binary:<hash>`. */
function filesMapSignature(snapshot: Record<string, SnapshotEntry>): string {
  const textFiles: Record<string, string> = {};
  const assets: Record<string, { hash: string }> = {};
  for (const [path, v] of Object.entries(snapshot)) {
    // Mirror getClientFiles: internal files are excluded so editing the concept
    // never makes the project look publish-dirty.
    if (isInternalVfsPath(path)) continue;
    if (typeof v === "string") textFiles[path] = v;
    else assets[path] = { hash: contentHash(v.content) };
  }
  return filesSignature(canonicalSignatureMap(textFiles, assets));
}

/** Takes the app offline; keeps the slug so re-publishing reuses the URL. */
export async function unpublishProject(projectId: string, userId: string) {
  await db
    .update(projects)
    .set({ published: false, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

/**
 * Un-authenticated lookup for the serve route: one file from a published slug's
 * frozen snapshot, or null. Reads the snapshot, never the live VFS. Path "/" maps
 * to /index.html.
 */
export async function readPublishedFile(
  slug: string,
  path: string,
): Promise<{
  projectId: string;
  content: string;
  encoding: FileEncoding;
  mimeType: string | null;
  dbEnabled: boolean;
  badgeHidden: boolean;
  hasThumbnail: boolean;
} | null> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.publishSlug, slug), eq(projects.published, true)),
  });
  if (!project) return null;

  const snapshot = await loadPublishedFilesMap(project);
  if (!snapshot) return null;

  const entry = snapshot[path === "/" ? "/index.html" : path];
  if (entry == null) return null;
  const { databaseEnabled: dbEnabled, badgeHidden } = project;
  // Whether an OG thumbnail is part of the frozen snapshot — free/authoritative
  // (the map is already loaded), so the served <head> only links an image that
  // actually resolves under this published slug.
  const hasThumbnail = snapshot[THUMBNAIL_PATH] != null;
  return typeof entry === "string"
    ? {
        projectId: project.id,
        content: entry,
        encoding: "utf8",
        mimeType: null,
        dbEnabled,
        badgeHidden,
        hasThumbnail,
      }
    : {
        projectId: project.id,
        content: entry.content,
        encoding: entry.encoding,
        mimeType: entry.mimeType ?? null,
        dbEnabled,
        badgeHidden,
        hasThumbnail,
      };
}

async function touchProject(projectId: string) {
  await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
