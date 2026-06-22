import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, files, messages } from "@/lib/db/schema";

// Service layer for per-user projects and their virtual filesystem. Every read
// and write is scoped by userId/projectId, which is what enforces multi-tenant
// isolation — the agent's tools go through these functions and can never reach
// another tenant's data or the host disk.

export type ProjectFile = { path: string; content: string };

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
    .select({ path: files.path, content: files.content })
    .from(files)
    .where(eq(files.projectId, projectId))
    .orderBy(asc(files.path));
  return rows;
}

export async function readFile(
  projectId: string,
  path: string,
): Promise<string | null> {
  const row = await db.query.files.findFirst({
    where: and(eq(files.projectId, projectId), eq(files.path, path)),
  });
  return row?.content ?? null;
}

export async function writeFile(
  projectId: string,
  path: string,
  content: string,
): Promise<void> {
  await db
    .insert(files)
    .values({ projectId, path, content })
    .onConflictDoUpdate({
      target: [files.projectId, files.path],
      set: { content, updatedAt: new Date() },
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

async function touchProject(projectId: string) {
  await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
