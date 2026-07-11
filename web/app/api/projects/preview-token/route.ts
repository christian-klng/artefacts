import { auth } from "@/auth";
import { getAccessibleProject } from "@/lib/projects";
import { signPreviewToken } from "@/lib/preview-token";
import { buildAppOrigin } from "@/lib/app-host";

// Mints a FRESH preview URL (origin + signed token) for an owned project.
//
// The initial preview URL is baked into the server-rendered workspace page, but
// that render is cacheable (prefetch + soft navigations keep it in the client
// Router Cache) while the token has a 1h TTL — so a long-lived tab can end up
// with an expired token in the iframe and the preview 403s ("Forbidden") until a
// hard refresh. The workspace refreshes the token from here on an interval so the
// iframe always carries a valid one, decoupled from the cached page.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return new Response("projectId is required", { status: 400 });

  const appsDomain = process.env.APPS_DOMAIN;
  if (!appsDomain) {
    // No apps sub-zone → the preview uses the srcDoc fallback, no token needed.
    return Response.json({ url: null });
  }

  try {
    // Owner OR admin (read-only) — so an admin's preview iframe gets a token too.
    await getAccessibleProject(projectId, session.user.id);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const url = `${buildAppOrigin(appsDomain, `preview-${projectId}`)}/?pt=${encodeURIComponent(
    signPreviewToken(projectId),
  )}`;
  return Response.json({ url });
}
