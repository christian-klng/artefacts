import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { publishProject, unpublishProject } from "@/lib/projects";
import { generateThumbnail } from "@/lib/thumbnail";
import { buildAppOrigin } from "@/lib/app-host";
import { verifyAdminApiSecret } from "@/lib/admin-api-secret";

// Internal endpoint the admin panel calls to publish / take offline any user's
// app on their behalf. Not a page and not user-authenticated: gated by the
// shared ADMIN_API_SECRET bearer (see lib/admin-api-secret.ts). Publishing needs
// the builder's backup-freeze + OG-thumbnail logic, which only lives here — the
// admin app (separate container, minimal schema) can't replicate it, so it
// delegates. We resolve the project's real owner and reuse the exact same
// publishProject/unpublishProject the builder toolbar uses.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!verifyAdminApiSecret(provided)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: { projectId?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const action = body.action;
  if (!projectId || (action !== "publish" && action !== "unpublish")) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  // Resolve the owner so publish/unpublish run under the project's real user
  // (both scope their write by userId — the admin acts on the owner's behalf).
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { id: true, userId: true },
  });
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    if (action === "unpublish") {
      await unpublishProject(projectId, project.userId);
      return Response.json({ ok: true, published: false });
    }

    const appsDomain = process.env.APPS_DOMAIN;
    if (!appsDomain) {
      return Response.json(
        { error: "APPS_DOMAIN is not configured" },
        { status: 400 },
      );
    }
    // Refresh the OG thumbnail from the current state before freezing the
    // publish snapshot. Best-effort: publish must never fail because the
    // screenshot service is down/slow (mirrors publishProjectAction).
    await generateThumbnail(projectId).catch(() => {});
    const { slug } = await publishProject(projectId, project.userId);
    return Response.json({
      ok: true,
      published: true,
      url: buildAppOrigin(appsDomain, slug),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Action failed" },
      { status: 500 },
    );
  }
}
