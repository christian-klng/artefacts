import "server-only";
import { listFiles } from "@/lib/projects";

// Helpers for treating the project's virtual filesystem as a real multi-file
// static site: content types for serving, and an inliner that turns a multi-file
// page into a single self-contained HTML for the srcDoc preview fallback.

const EXT_CONTENT_TYPE: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
};

function ext(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i + 1).toLowerCase();
}

/** Content-Type for a VFS file: stored mimeType wins, else inferred from extension. */
export function contentTypeFor(path: string, mimeType?: string | null): string {
  if (mimeType) return mimeType;
  return EXT_CONTENT_TYPE[ext(path)] ?? "application/octet-stream";
}

/** Normalizes a page-relative ref (e.g. "assets/x.png", "./x", "/x") to a VFS key. */
function refToVfsPath(ref: string): string {
  let p = ref.trim().replace(/^\.\//, "");
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

function isExternal(ref: string): boolean {
  return /^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(ref.trim());
}

/**
 * Inlines references to other VFS files into the HTML so the page renders as a
 * single self-contained document — used only for the srcDoc preview fallback
 * (no APPS_DOMAIN). Every `src`/`href`/`url(...)` that resolves to a project file
 * becomes a `data:` URI of that file's content. Best-effort and regex-based; the
 * real multi-file path is the subdomain serve route.
 */
export async function inlineVfsAssets(
  projectId: string,
  html: string,
): Promise<string> {
  const files = await listFiles(projectId);
  const byPath = new Map(files.map((f) => [f.path, f]));

  const dataUri = (file: {
    path: string;
    content: string;
    encoding: string;
    mimeType: string | null;
  }): string => {
    const ct = contentTypeFor(file.path, file.mimeType).split(";")[0];
    const base64 =
      file.encoding === "base64"
        ? file.content
        : Buffer.from(file.content, "utf-8").toString("base64");
    return `data:${ct};base64,${base64}`;
  };

  const resolve = (ref: string): string | null => {
    if (isExternal(ref)) return null;
    const file = byPath.get(refToVfsPath(ref));
    if (!file || file.path === "/index.html") return null;
    return dataUri(file);
  };

  // src="…" / href="…" (single or double quoted)
  html = html.replace(
    /\b(src|href)\s*=\s*(["'])(.*?)\2/gi,
    (whole, attr, q, ref) => {
      const uri = resolve(ref);
      return uri ? `${attr}=${q}${uri}${q}` : whole;
    },
  );

  // url(…) inside inline CSS
  html = html.replace(
    /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
    (whole, _q, ref) => {
      const uri = resolve(ref);
      return uri ? `url(${uri})` : whole;
    },
  );

  return html;
}
