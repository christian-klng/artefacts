import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";

// Service layer for per-project uploaded reference files. Like lib/projects.ts,
// every read/write is scoped by projectId — that's the multi-tenant isolation
// boundary. Attachments are read-only context for the agent and live outside the
// file VFS, so they never leak into the app's code tree or published versions.

export type AttachmentKind = "text" | "image";

export type AttachmentMeta = {
  id: string;
  filename: string;
  mimeType: string;
  kind: AttachmentKind;
  size: number;
  createdAt: Date;
  // A short slice of the extracted text, for listings. Null for images.
  preview: string | null;
};

const PREVIEW_CHARS = 500;

/** Lists a project's attachments (metadata + a short text preview, no payload). */
export async function listAttachments(
  projectId: string,
): Promise<AttachmentMeta[]> {
  const rows = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
      kind: attachments.kind,
      size: attachments.size,
      createdAt: attachments.createdAt,
      extractedText: attachments.extractedText,
    })
    .from(attachments)
    .where(eq(attachments.projectId, projectId))
    .orderBy(asc(attachments.createdAt));

  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    mimeType: r.mimeType,
    kind: r.kind as AttachmentKind,
    size: r.size,
    createdAt: r.createdAt,
    preview:
      r.extractedText != null
        ? r.extractedText.slice(0, PREVIEW_CHARS) +
          (r.extractedText.length > PREVIEW_CHARS ? "…" : "")
        : null,
  }));
}

export async function createAttachment(
  projectId: string,
  data: {
    filename: string;
    mimeType: string;
    kind: AttachmentKind;
    size: number;
    dataBase64: string;
    extractedText: string | null;
  },
) {
  const [row] = await db
    .insert(attachments)
    .values({ projectId, ...data })
    .returning({
      id: attachments.id,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
      kind: attachments.kind,
      size: attachments.size,
      createdAt: attachments.createdAt,
    });
  return row;
}

/** Extracted text of one attachment (for the agent's read tool), or null. */
export async function getAttachmentText(
  projectId: string,
  id: string,
): Promise<{ filename: string; extractedText: string | null } | null> {
  const row = await db.query.attachments.findFirst({
    where: and(eq(attachments.id, id), eq(attachments.projectId, projectId)),
    columns: { filename: true, extractedText: true },
  });
  return row ?? null;
}

/** Original payload of one attachment (for download + the agent's image block). */
export async function getAttachmentData(
  projectId: string,
  id: string,
): Promise<{
  filename: string;
  mimeType: string;
  kind: AttachmentKind;
  dataBase64: string;
} | null> {
  const row = await db.query.attachments.findFirst({
    where: and(eq(attachments.id, id), eq(attachments.projectId, projectId)),
    columns: { filename: true, mimeType: true, kind: true, dataBase64: true },
  });
  if (!row) return null;
  return { ...row, kind: row.kind as AttachmentKind };
}

export async function deleteAttachment(
  projectId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.projectId, projectId)))
    .returning({ id: attachments.id });
  return result.length > 0;
}
