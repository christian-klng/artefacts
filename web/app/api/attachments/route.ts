import { auth } from "@/auth";
import { getOwnedProject } from "@/lib/projects";
import { createAttachment, listAttachments } from "@/lib/attachments";
import { extractAttachment, MAX_ATTACHMENT_BYTES } from "@/lib/attachments/extract";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

// Text extraction (pdf-parse/mammoth) needs Node APIs — never the edge runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/attachments?projectId=… → metadata + preview for the "Dateien" view.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }
  try {
    await getOwnedProject(projectId, userId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return Response.json({ attachments: await listAttachments(projectId) });
}

// POST /api/attachments (multipart: file + projectId) → upload one reference file.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const projectId = form?.get("projectId");
  if (!(file instanceof File) || typeof projectId !== "string") {
    return Response.json(
      { error: "file and projectId are required" },
      { status: 400 },
    );
  }

  try {
    await getOwnedProject(projectId, userId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const t = getMessages(await resolveLocale()).attachments;
  if (file.size === 0) {
    return Response.json({ error: t.errEmpty }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Response.json(
      {
        error: t.errTooLarge.replace(
          "{max}",
          String(MAX_ATTACHMENT_BYTES / 1024 / 1024),
        ),
      },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name || "upload";
  const mimeType = file.type || "application/octet-stream";

  const extracted = await extractAttachment({ filename, mimeType, buffer });
  if (!extracted.ok) {
    return Response.json({ error: extracted.error }, { status: 415 });
  }

  const created = await createAttachment(projectId, {
    filename,
    mimeType,
    kind: extracted.kind,
    size: file.size,
    dataBase64: buffer.toString("base64"),
    extractedText: extracted.extractedText,
  });

  return Response.json({ attachment: created }, { status: 201 });
}
