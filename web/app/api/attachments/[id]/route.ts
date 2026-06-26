import { auth } from "@/auth";
import { getOwnedProject } from "@/lib/projects";
import { deleteAttachment, getAttachmentData } from "@/lib/attachments";

export const runtime = "nodejs";

// GET /api/attachments/<id>?projectId=… → download the original file.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return new Response("projectId is required", { status: 400 });
  try {
    await getOwnedProject(projectId, userId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const data = await getAttachmentData(projectId, id);
  if (!data) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(data.dataBase64, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": data.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(
        data.filename,
      )}"`,
      "Content-Length": String(bytes.length),
    },
  });
}

// DELETE /api/attachments/<id>?projectId=… → remove an uploaded file.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return new Response("projectId is required", { status: 400 });
  try {
    await getOwnedProject(projectId, userId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const deleted = await deleteAttachment(projectId, id);
  if (!deleted) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
