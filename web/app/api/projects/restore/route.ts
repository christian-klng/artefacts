import { auth } from "@/auth";
import { getOwnedProject } from "@/lib/projects";
import { restoreBackup } from "@/lib/backup";
import { logError } from "@/lib/error-log";

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

  // Restore mutates several stores in sequence and is NOT one transaction, so a
  // mid-way failure (insufficient DB privileges, non-replayable app DDL, a data
  // type the dump can't round-trip, an oversized blob) throws. Surface the real
  // reason instead of a bare 500 — this is an owner-gated builder route, so the
  // message is safe to return, and the server log keeps the full stack.
  try {
    // Restores the WHOLE app (files + DB + end-user accounts + attachments +
    // settings). Returns { files, assets, internal } for the workspace to re-render.
    const result = await restoreBackup(projectId, backupId);
    return Response.json(result);
  } catch (e) {
    // Persist for the admin /logs view (also console.errors the full trace).
    await logError("restore", e, {
      projectId,
      userId: session.user.id,
      context: { backupId },
    });
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
