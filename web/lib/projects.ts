import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, files, messages, artifactVersions } from "@/lib/db/schema";
import { publishSlugFromLabel } from "@/lib/app-host";
import { canonicalSignatureMap, filesSignature } from "@/lib/files-signature";

export type FileEncoding = "utf8" | "base64";

// A snapshot entry: a plain string is legacy/text (utf8); an object carries a
// binary asset (base64 + mimeType). Lets restore/publish stay backward-compatible.
type SnapshotEntry =
  | string
  | { content: string; encoding: FileEncoding; mimeType: string | null };

/** sha256 of a file's stored content — stable id for change detection. */
function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// What the client needs to render the workspace: text files in full, binary
// assets as metadata only (never ship base64 to the browser).
export type ClientFiles = {
  files: Record<string, string>;
  assets: Record<string, { mimeType: string | null; size: number; hash: string }>;
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
  const result: ClientFiles = { files: {}, assets: {} };
  for (const f of all) {
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
  role: "user" | "assistant" | "system",
  content: string,
) {
  const [row] = await db
    .insert(messages)
    .values({ projectId, role, content })
    .returning();
  return row;
}

export async function getMessages(projectId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.projectId, projectId))
    .orderBy(asc(messages.createdAt));
}

// --- Artifact versions: snapshots of the whole virtual filesystem ---------

/** Snapshots the project's current files as a new restorable version. */
export async function createVersion(projectId: string, label?: string) {
  const all = await listFiles(projectId);
  const snapshot = JSON.stringify(
    Object.fromEntries(
      all.map((f): [string, SnapshotEntry] => [
        f.path,
        f.encoding === "base64"
          ? { content: f.content, encoding: f.encoding, mimeType: f.mimeType }
          : f.content,
      ]),
    ),
  );
  const [row] = await db
    .insert(artifactVersions)
    .values({ projectId, label: label ?? null, snapshot })
    .returning({
      id: artifactVersions.id,
      label: artifactVersions.label,
      createdAt: artifactVersions.createdAt,
    });
  return row;
}

export async function listVersions(projectId: string) {
  return db
    .select({
      id: artifactVersions.id,
      label: artifactVersions.label,
      createdAt: artifactVersions.createdAt,
    })
    .from(artifactVersions)
    .where(eq(artifactVersions.projectId, projectId))
    .orderBy(desc(artifactVersions.createdAt));
}

/** Replaces the project's files with a stored version's snapshot. */
export async function restoreVersion(
  projectId: string,
  versionId: string,
): Promise<ClientFiles> {
  const version = await db.query.artifactVersions.findFirst({
    where: and(
      eq(artifactVersions.id, versionId),
      eq(artifactVersions.projectId, projectId),
    ),
  });
  if (!version) throw new Error("Version not found");

  const snapshot = JSON.parse(version.snapshot) as Record<string, SnapshotEntry>;
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
  await touchProject(projectId);
  return getClientFiles(projectId);
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
 * that snapshot publicly. Reuses the existing slug on re-publish. Returns it.
 */
export async function publishProject(
  projectId: string,
  userId: string,
): Promise<{ slug: string }> {
  const project = await getOwnedProject(projectId, userId);
  if ((await readFile(projectId, "/index.html")) == null) {
    throw new Error("Nothing to publish: no /index.html yet");
  }

  const version = await createVersion(projectId, "Published");
  const slug =
    project.publishSlug ?? (await uniqueSlug(slugify(project.name), projectId));

  await db
    .update(projects)
    .set({
      published: true,
      publishSlug: slug,
      publishedVersionId: version.id,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  return { slug };
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
  if (!project?.publishedVersionId) return null;

  const version = await db.query.artifactVersions.findFirst({
    where: and(
      eq(artifactVersions.id, project.publishedVersionId),
      eq(artifactVersions.projectId, projectId),
    ),
  });
  if (!version) return null;

  return snapshotSignature(version.snapshot);
}

/** Signature over a snapshot, treating binary entries as `binary:<hash>`. */
function snapshotSignature(snapshotJson: string): string {
  const snapshot = JSON.parse(snapshotJson) as Record<string, SnapshotEntry>;
  const textFiles: Record<string, string> = {};
  const assets: Record<string, { hash: string }> = {};
  for (const [path, v] of Object.entries(snapshot)) {
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
} | null> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.publishSlug, slug), eq(projects.published, true)),
  });
  if (!project?.publishedVersionId) return null;

  const version = await db.query.artifactVersions.findFirst({
    where: and(
      eq(artifactVersions.id, project.publishedVersionId),
      eq(artifactVersions.projectId, project.id),
    ),
  });
  if (!version) return null;

  const snapshot = JSON.parse(version.snapshot) as Record<string, SnapshotEntry>;
  const entry = snapshot[path === "/" ? "/index.html" : path];
  if (entry == null) return null;
  return typeof entry === "string"
    ? { projectId: project.id, content: entry, encoding: "utf8", mimeType: null }
    : {
        projectId: project.id,
        content: entry.content,
        encoding: entry.encoding,
        mimeType: entry.mimeType ?? null,
      };
}

async function touchProject(projectId: string) {
  await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
