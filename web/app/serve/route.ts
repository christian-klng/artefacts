import { readFile, readPublishedIndexHtml } from "@/lib/projects";
import { expandAttachmentRefs } from "@/lib/attachments/embed";
import { verifyPreviewToken } from "@/lib/preview-token";
import {
  parseAppLabel,
  previewProjectId,
  publishSlugFromLabel,
} from "@/lib/app-host";

// Serves a generated app's self-contained /index.html on its own origin
// (<label>.apps.<APPS_DOMAIN>), reached via the rewrite in proxy.ts. Preview
// origins are gated by a signed token in the URL (?pt=…), because the builder's
// session cookie is intentionally not shared with the apps sub-zone.
//
// On the builder/main domain this route is reachable too, but parseAppLabel
// returns null there, so it 404s — it only serves real app sub-zone hosts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function injectBootstrap(html: string, projectId: string): string {
  // Minimal config for the future client SDK (db/auth land in Phase 2/3).
  const tag = `<script>window.__ARTEFACTS__=${JSON.stringify({ projectId })};</script>`;
  return html.includes("</head>")
    ? html.replace("</head>", `${tag}</head>`)
    : `${tag}${html}`;
}

export async function GET(request: Request) {
  // proxy.ts pins the real app host here before rewriting to /serve, because
  // NextResponse.rewrite otherwise replaces the Host header with the internal
  // host. Fall back to the Host header for direct /serve hits (no rewrite).
  const host = request.headers.get("x-app-host") || request.headers.get("host");
  const appsDomain = process.env.APPS_DOMAIN ?? "";

  const label = parseAppLabel(host, appsDomain);

  // Preview host (preview-<uuid>): the builder's own gated preview of the LIVE
  // VFS, authorized by a signed token.
  const projectId = previewProjectId(label);
  if (projectId) {
    const token = new URL(request.url).searchParams.get("pt");
    if (verifyPreviewToken(token) !== projectId) {
      return new Response("Forbidden", { status: 403 });
    }

    const html = await readFile(projectId, "/index.html");
    if (html == null) {
      return new Response("This app has no /index.html yet.", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const expanded = await expandAttachmentRefs(projectId, html);
    return htmlResponse(injectBootstrap(expanded, projectId));
  }

  // Published host (<slug>): the public, un-gated app, served from the FROZEN
  // snapshot captured at publish time — never the live VFS.
  const slug = publishSlugFromLabel(label);
  if (slug) {
    const published = await readPublishedIndexHtml(slug);
    if (published) {
      // The snapshot stores tokens (small); expand to inline assets at serve time.
      const expanded = await expandAttachmentRefs(
        published.projectId,
        published.html,
      );
      return htmlResponse(injectBootstrap(expanded, published.projectId));
    }
  }

  return new Response("Not found", { status: 404 });
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Always reflect the latest snapshot/VFS; the builder busts the iframe per
      // change, and a re-publish should be visible immediately.
      "cache-control": "no-store",
    },
  });
}
