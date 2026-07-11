import "server-only";
import { listFiles } from "@/lib/projects";

// Helpers for treating the project's virtual filesystem as a real multi-file
// static site: content types for serving, and an inliner that turns a multi-file
// page into a single self-contained HTML for the srcDoc preview fallback.

/**
 * Fixed path of the shared icon sprite the media tool maintains (see
 * lib/agent/tools-media.ts `add_icons`). Icons are referenced by same-document
 * `<use href="#id">`; `embedIconSprite` inlines the sprite into the served HTML
 * on EVERY path (srcDoc preview + OG thumbnail, subdomain/publish serve, export
 * ZIP), so that one reference form resolves everywhere — including icons the
 * app's JS builds at runtime and file:// downloads. Legacy external
 * `assets/icons.svg#id` refs are normalized to `#id` on the way out.
 */
export const ICON_SPRITE_PATH = "/assets/icons.svg";

// Fresh instance per use (global regex; see cssUrlPattern note). Matches a
// `(xlink:)href="…assets/icons.svg#id"` sprite reference; the path mirrors the
// basename of ICON_SPRITE_PATH.
const spriteRefPattern = () =>
  /(xlink:href|href)\s*=\s*(["'])(?:\.?\/)?assets\/icons\.svg#([^"'#]+)\2/gi;

/**
 * Embeds the icon sprite into an HTML document and normalizes any legacy
 * external `assets/icons.svg#id` refs to same-document `#id`. Used by EVERY
 * html-producing path (srcDoc render, subdomain/publish serve, export ZIP) so a
 * single reference form — `<use href="#id">`, whether hand-written or built at
 * runtime by the app's own JS — resolves everywhere: the origin-less srcDoc
 * preview, the real subdomain, and a file:// download. Idempotent (the sprite
 * carries a `data-icon-sprite` marker, so it is never embedded twice).
 */
export function embedIconSprite(
  html: string,
  spriteContent: string | null,
): string {
  if (!spriteContent) return html;
  html = html.replace(
    spriteRefPattern(),
    (_whole, attr, q, id) => `${attr}=${q}#${id}${q}`,
  );
  if (/\bdata-icon-sprite\b/i.test(html)) return html;
  const bodyOpen = html.match(/<body[^>]*>/i);
  const at = bodyOpen ? bodyOpen.index! + bodyOpen[0].length : 0;
  return html.slice(0, at) + spriteContent + html.slice(at);
}

const EXT_CONTENT_TYPE: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  // Serve SEO files with correct types — without `xml`, sitemap.xml falls
  // through to application/octet-stream and some crawlers reject it.
  xml: "application/xml; charset=utf-8",
  webmanifest: "application/manifest+json; charset=utf-8",
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
  ttf: "font/ttf",
  otf: "font/otf",
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
 * (no APPS_DOMAIN) and the OG-thumbnail render. Every `src`/`href`/`url(...)`
 * that resolves to a project file becomes a `data:` URI of that file's content.
 * Best-effort and regex-based; the real multi-file path is the subdomain serve
 * route.
 */
export async function inlineVfsAssets(
  projectId: string,
  html: string,
): Promise<string> {
  return inlineFilesIntoHtml(html, await listFiles(projectId));
}

type VfsFileLike = {
  path: string;
  content: string;
  encoding: string;
  mimeType: string | null;
};

// Fresh instance per use: the pattern runs nested (page pass + inside-CSS
// pass), and a shared global regex would clobber its own lastIndex.
const cssUrlPattern = () => /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;

/** The pure inliner behind `inlineVfsAssets` (exported for tests). */
export function inlineFilesIntoHtml(
  html: string,
  files: VfsFileLike[],
): string {
  const byPath = new Map(files.map((f) => [f.path, f]));

  const lookup = (ref: string): VfsFileLike | null => {
    if (isExternal(ref)) return null;
    const file = byPath.get(refToVfsPath(ref));
    if (!file || file.path === "/index.html") return null;
    return file;
  };

  const rawDataUri = (file: VfsFileLike): string => {
    const ct = contentTypeFor(file.path, file.mimeType).split(";")[0];
    const base64 =
      file.encoding === "base64"
        ? file.content
        : Buffer.from(file.content, "utf-8").toString("base64");
    return `data:${ct};base64,${base64}`;
  };

  // A text stylesheet's own url(...) refs (webfonts, background images) must
  // be inlined BEFORE the stylesheet itself becomes a data: URI — relative
  // URLs cannot resolve against a data: base, so an untouched /styles.css
  // would lose its fonts/images in the srcDoc preview and the OG thumbnail.
  // One level deep: a css referenced from within css embeds as-is.
  const dataUri = (file: VfsFileLike): string => {
    if (file.encoding !== "base64" && ext(file.path) === "css") {
      const rewritten = file.content.replace(
        cssUrlPattern(),
        (whole, _q, ref) => {
          const target = lookup(ref);
          return target ? `url(${rawDataUri(target)})` : whole;
        },
      );
      return `data:text/css;base64,${Buffer.from(rewritten, "utf-8").toString("base64")}`;
    }
    // A separate JS file that builds icons at runtime uses the same sprite ref;
    // the origin-less srcDoc render can't fetch the external file, so point those
    // runtime `<use>`s at the embedded sprite too. New builds already emit "#id"
    // (this is the no-op-then; it only rescues legacy assets/icons.svg#id JS).
    if (
      file.encoding !== "base64" &&
      (ext(file.path) === "js" || ext(file.path) === "mjs")
    ) {
      const rewritten = file.content.replace(
        /(["'`])(?:\.?\/)?assets\/icons\.svg#/gi,
        "$1#",
      );
      return `data:text/javascript;base64,${Buffer.from(rewritten, "utf-8").toString("base64")}`;
    }
    return rawDataUri(file);
  };

  const resolve = (ref: string): string | null => {
    const file = lookup(ref);
    return file ? dataUri(file) : null;
  };

  // Icon sprite: an external `<use href="assets/icons.svg#id">` can't resolve in
  // an origin-less render, and a JS-built `<use href="#id">` needs the symbols in
  // the document — so embed the sprite once and normalize refs (shared with the
  // serve + export paths). Data-URI `<use>` is blocked by browsers, so this — not
  // the general src/href pass below — is how the sprite reaches the srcDoc
  // preview and the OG thumbnail.
  const sprite = byPath.get(ICON_SPRITE_PATH);
  html = embedIconSprite(
    html,
    sprite && sprite.encoding !== "base64" ? sprite.content : null,
  );

  // src="…" / href="…" (single or double quoted)
  html = html.replace(
    /\b(src|href)\s*=\s*(["'])(.*?)\2/gi,
    (whole, attr, q, ref) => {
      const uri = resolve(ref);
      return uri ? `${attr}=${q}${uri}${q}` : whole;
    },
  );

  // url(…) inside inline CSS
  html = html.replace(cssUrlPattern(), (whole, _q, ref) => {
    const uri = resolve(ref);
    return uri ? `url(${uri})` : whole;
  });

  return html;
}
