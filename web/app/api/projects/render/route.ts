import { auth } from "@/auth";
import { getOwnedProject, readFile } from "@/lib/projects";
import { expandAttachmentRefs } from "@/lib/attachments/embed";

// Returns the project's /index.html with attachment references expanded into
// inline data URIs — the self-contained page. The builder client uses this for
// the srcDoc preview fallback (no APPS_DOMAIN) and for download, since it can't
// reach the DB to expand tokens itself. Ownership-gated.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return new Response("projectId is required", { status: 400 });
  try {
    await getOwnedProject(projectId, userId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const html = await readFile(projectId, "/index.html");
  if (html == null) return new Response("Not found", { status: 404 });

  const expanded = await expandAttachmentRefs(projectId, html);
  return new Response(expanded, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
