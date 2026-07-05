import { auth } from "@/auth";
import { getOwnedProject, readFile } from "@/lib/projects";
import { inlineVfsAssets } from "@/lib/vfs";
import { injectBadge } from "@/lib/badge";
import { substituteSiteUrl } from "@/lib/site-url";

// Returns the project's /index.html with references to other VFS files inlined
// as data URIs — a single self-contained document for the srcDoc preview fallback
// (no APPS_DOMAIN). With APPS_DOMAIN set, the preview uses the multi-file serve
// route instead and never hits this. Ownership-gated.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return new Response("projectId is required", { status: 400 });
  let project;
  try {
    project = await getOwnedProject(projectId, userId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const html = await readFile(projectId, "/index.html");
  if (html == null) return new Response("Not found", { status: 404 });

  // This inline preview has no real public origin; drop the __SITE_URL__
  // placeholder to a relative path so it never shows up raw in the document.
  let inlined = await inlineVfsAssets(projectId, substituteSiteUrl(html, ""));
  // Same "Erstellt mit Kubikraum" badge as the subdomain serve route, so the
  // srcDoc preview fallback matches production. Skipped per project.
  if (!project.badgeHidden) inlined = injectBadge(inlined);
  return new Response(inlined, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
