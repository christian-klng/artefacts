import { auth } from "@/auth";
import { getOwnedProject } from "@/lib/projects";
import { restoreBackup } from "@/lib/backup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const projectId = body?.projectId;
  const backupId = body?.backupId;
  if (typeof projectId !== "string" || typeof backupId !== "string") {
    return Response.json(
      { error: "projectId and backupId are required" },
      { status: 400 },
    );
  }

  // Ownership check before touching anything.
  await getOwnedProject(projectId, session.user.id);
  // Restores the WHOLE app (files + DB + end-user accounts + attachments +
  // settings). Returns { files, assets, internal } for the workspace to re-render.
  const result = await restoreBackup(projectId, backupId);
  return Response.json(result);
}
