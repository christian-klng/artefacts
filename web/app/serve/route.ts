import { readFileRaw, readPublishedFile } from "@/lib/projects";
import { contentTypeFor } from "@/lib/vfs";
import { verifyPreviewToken } from "@/lib/preview-token";
import {
  parseAppLabel,
  previewProjectId,
  publishSlugFromLabel,
} from "@/lib/app-host";

// Serves a generated app's virtual filesystem on its own origin
// (<label>.apps.<APPS_DOMAIN>), reached via the rewrite in proxy.ts. The app may
// be multiple files (index.html + /assets/* etc.); the requested path arrives on
// x-app-path. Preview origins are gated by a signed token in the URL (?pt=…).
//
// On the builder/main domain parseAppLabel returns null, so this route 404s — it
// only serves real app sub-zone hosts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function injectBootstrap(html: string, projectId: string): string {
  // Minimal config for the future client SDK (db/auth land in Phase 2/3).
  const tag = `<script>window.__ARTEFACTS__=${JSON.stringify({ projectId })};</script>`;
  return html.includes("</head>")
    ? html.replace("</head>", `${tag}</head>`)
    : `${tag}${html}`;
}

function fileResponse(
  file: { content: string; encoding: string; mimeType: string | null },
  path: string,
  projectId: string,
): Response {
  const contentType = contentTypeFor(path, file.mimeType);
  const isHtml = contentType.startsWith("text/html");

  if (file.encoding === "base64") {
    const bytes = Buffer.from(file.content, "base64");
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": contentType, "cache-control": "no-store" },
    });
  }
  // Text: inject the bootstrap only into the HTML entry document.
  const body = isHtml ? injectBootstrap(file.content, projectId) : file.content;
  return new Response(body, {
    headers: { "content-type": contentType, "cache-control": "no-store" },
  });
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function GET(request: Request) {
  // proxy.ts pins the real app host + path here before rewriting to /serve.
  const host = request.headers.get("x-app-host") || request.headers.get("host");
  const reqPath = request.headers.get("x-app-path") || "/";
  const path = reqPath === "/" ? "/index.html" : reqPath;
  const appsDomain = process.env.APPS_DOMAIN ?? "";

  const label = parseAppLabel(host, appsDomain);

  // Preview host (preview-<uuid>): the builder's gated preview of the LIVE VFS.
  const projectId = previewProjectId(label);
  if (projectId) {
    // The entry document carries the signed token in ?pt=. Its sub-resources
    // (relative <img>/<link>/<script> for a multi-file app) are requested
    // WITHOUT the query string, so we also accept the token from a cookie that
    // the entry response sets, scoped to this unique preview host.
    const queryToken = new URL(request.url).searchParams.get("pt");
    const token = queryToken ?? readCookie(request.headers.get("cookie"), "pt");
    if (verifyPreviewToken(token) !== projectId) {
      return new Response("Forbidden", { status: 403 });
    }
    const file = await readFileRaw(projectId, path);
    if (!file) return new Response("Not found", { status: 404 });
    const res = fileResponse(file, path, projectId);
    if (queryToken) {
      const secure = host?.split(":")[0].endsWith("localhost") ? "" : " Secure;";
      res.headers.set(
        "Set-Cookie",
        `pt=${encodeURIComponent(queryToken)}; Path=/; HttpOnly; SameSite=Lax;${secure}`,
      );
    }
    return res;
  }

  // Published host (<slug>): the public app, from the FROZEN snapshot.
  const slug = publishSlugFromLabel(label);
  if (slug) {
    const file = await readPublishedFile(slug, path);
    if (file) return fileResponse(file, path, file.projectId);
  }

  return new Response("Not found", { status: 404 });
}
