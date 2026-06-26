import { readFile } from "@/lib/projects";
import { verifyPreviewToken } from "@/lib/preview-token";
import { parseAppLabel, previewProjectId } from "@/lib/app-host";

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
  const projectId = previewProjectId(label);
  if (!projectId) return new Response("Not found", { status: 404 });

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

  return new Response(injectBootstrap(html, projectId), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Always reflect the latest VFS; the builder busts the iframe per change.
      "cache-control": "no-store",
    },
  });
}
