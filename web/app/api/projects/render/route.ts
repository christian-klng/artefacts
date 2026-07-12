import { auth } from "@/auth";
import { getAccessibleProject, readFile } from "@/lib/projects";
import { inlineVfsAssets } from "@/lib/vfs";
import { injectBadge } from "@/lib/badge";
import { annotateEditableText, injectInlineEditRuntime } from "@/lib/inline-edit";
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
    // Owner OR admin (read-only) — the srcDoc preview fallback for admins too.
    ({ project } = await getAccessibleProject(projectId, userId));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const html = await readFile(projectId, "/index.html");
  if (html == null) return new Response("Not found", { status: 404 });

  // Inline edit mode (?edit=1): tag editable leaf text elements over the raw
  // stored source first, so ordinals match a save-time walk (see the subdomain
  // serve route). The srcDoc iframe is sandboxed without allow-same-origin, so
  // the runtime talks to the builder purely via postMessage.
  const editMode = new URL(request.url).searchParams.get("edit") === "1";
  const source = editMode ? annotateEditableText(html) : html;

  // This inline preview has no real public origin; drop the __SITE_URL__
  // placeholder to a relative path so it never shows up raw in the document.
  let inlined = await inlineVfsAssets(projectId, substituteSiteUrl(source, ""));
  // Same "Erstellt mit Kubikraum" badge as the subdomain serve route, so the
  // srcDoc preview fallback matches production. Skipped per project.
  if (!project.badgeHidden) inlined = injectBadge(inlined);
  if (editMode) inlined = injectInlineEditRuntime(inlined);
  return new Response(inlined, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
