import {
  readFileRaw,
  readPublishedFile,
  getProjectServeMeta,
} from "@/lib/projects";
import { isInternalVfsPath } from "@/lib/concept";
import { injectBadge } from "@/lib/badge";
import { injectOgImage, THUMBNAIL_PATH } from "@/lib/og-image";
import { substituteSiteUrl, originFromHost } from "@/lib/site-url";
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

// Client SDK injected into served HTML when the app has a database. Talks to the
// same-origin /api/appdb + /api/appauth routes; exposes a small chainable query
// builder + auth helpers as window.artefacts. No raw SQL ever crosses to here.
const ARTEFACTS_SDK = `(function(){
  function call(path, body){
    return fetch(path, {method:'POST', headers:{'content-type':'application/json'}, credentials:'same-origin', body:JSON.stringify(body)})
      .then(function(r){ return r.json().then(function(j){ return {status:r.status, body:j}; }); });
  }
  function from(table){
    var q = {table: table, op:'select', where: []};
    function run(){
      return call('/api/appdb', q).then(function(res){
        if(res.status>=400){ throw new Error(res.body && res.body.error || 'Datenbankfehler'); }
        return res.body.rows;
      });
    }
    var api = {
      select:function(cols){ if(cols) q.columns=cols; return api; },
      where:function(c,op,v){ q.where.push({column:c,op:op,value:v}); return api; },
      order:function(c,dir){ q.orderBy={column:c,dir:dir||'asc'}; return api; },
      limit:function(n){ q.limit=n; return api; },
      offset:function(n){ q.offset=n; return api; },
      list:function(){ q.op='select'; return run(); },
      insert:function(values){ q.op='insert'; q.values=values; return run(); },
      update:function(values){ q.op='update'; q.values=values; return run(); },
      delete:function(){ q.op='delete'; return run(); }
    };
    return api;
  }
  var auth = {
    signup:function(c){ return call('/api/appauth',{action:'signup',email:c.email,password:c.password,name:c.name}).then(function(r){return r.body;}); },
    login:function(c){ return call('/api/appauth',{action:'login',email:c.email,password:c.password}).then(function(r){return r.body;}); },
    logout:function(){ return call('/api/appauth',{action:'logout'}).then(function(){return true;}); },
    user:function(){ return fetch('/api/appauth',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){return j.user;}); }
  };
  var cfg = window.__ARTEFACTS__ || {};
  window.artefacts = {projectId: cfg.projectId, db:{from: from}, auth: auth};
})();`;

function injectBootstrap(
  html: string,
  projectId: string,
  dbEnabled: boolean,
): string {
  let tag = `<script>window.__ARTEFACTS__=${JSON.stringify({ projectId })};</script>`;
  // The data/auth SDK only exists when the app actually has a database, so
  // feature-detecting window.artefacts reflects reality.
  if (dbEnabled) tag += `<script>${ARTEFACTS_SDK}</script>`;
  return html.includes("</head>")
    ? html.replace("</head>", `${tag}</head>`)
    : `${tag}${html}`;
}

function fileResponse(
  file: { content: string; encoding: string; mimeType: string | null },
  path: string,
  projectId: string,
  origin: string,
  dbEnabled: boolean,
  showBadge: boolean,
  hasThumbnail: boolean,
): Response {
  const contentType = contentTypeFor(path, file.mimeType);
  const isHtml = contentType.startsWith("text/html");

  if (file.encoding === "base64") {
    const bytes = Buffer.from(file.content, "base64");
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": contentType, "cache-control": "no-store" },
    });
  }
  // Text: resolve the __SITE_URL__ placeholder to this real origin (so SEO files
  // ship absolute URLs), then inject the bootstrap into the HTML entry document.
  let body = substituteSiteUrl(file.content, origin);
  if (isHtml) {
    body = injectBootstrap(body, projectId, dbEnabled);
    // "Erstellt mit Kubikraum" — injected here (not in the VFS) so it shows on
    // the published app + preview but is absent from the exported ZIP. Skipped
    // per project via badgeHidden.
    if (showBadge) body = injectBadge(body);
    // Auto-generated OG thumbnail (screenshot of the page header): link it as
    // og:image with this real origin. Serve-time only, like the badge — the
    // exported ZIP keeps the user's own tags. No-op when no thumbnail exists.
    body = injectOgImage(body, origin, hasThumbnail);
  }
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
  // Agent-internal files live in the VFS but are never part of the shipped app.
  if (isInternalVfsPath(path)) return new Response("Not found", { status: 404 });
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
    const { dbEnabled, badgeHidden } = await getProjectServeMeta(projectId);
    // Only the HTML entry doc needs the thumbnail check — one cheap indexed read,
    // skipped for asset sub-requests (and for the thumbnail file itself).
    const isHtml = contentTypeFor(path, file.mimeType).startsWith("text/html");
    const hasThumbnail =
      isHtml &&
      path !== THUMBNAIL_PATH &&
      (await readFileRaw(projectId, THUMBNAIL_PATH)) !== null;
    const res = fileResponse(
      file,
      path,
      projectId,
      originFromHost(host ?? ""),
      dbEnabled,
      !badgeHidden,
      hasThumbnail,
    );
    // The preview origin is an ephemeral, gated view of the live VFS — never the
    // canonical address — so keep it out of search/answer-engine indexes.
    res.headers.set("X-Robots-Tag", "noindex");
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
    if (file) {
      return fileResponse(
        file,
        path,
        file.projectId,
        originFromHost(host ?? ""),
        file.dbEnabled,
        !file.badgeHidden,
        file.hasThumbnail,
      );
    }
  }

  return new Response("Not found", { status: 404 });
}
