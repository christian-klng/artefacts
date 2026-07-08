import "server-only";
import { createHash } from "node:crypto";
import { readFile, writeBinaryFile } from "@/lib/projects";
import { inlineVfsAssets } from "@/lib/vfs";
import { substituteSiteUrl } from "@/lib/site-url";
import { settingString } from "@/lib/settings";
import { THUMBNAIL_PATH } from "@/lib/og-image";

// Generates the OpenGraph thumbnail for a project: builds the app's fully-inlined
// HTML, hands it to the internal `shot` screenshot service, and stores the
// returned 1200x630 PNG in the VFS at THUMBNAIL_PATH. The serve route then links
// it as og:image (see lib/og-image.ts).
//
// Fully fail-safe: any missing config, service error or timeout returns null and
// never throws — a builder turn must never break because a thumbnail couldn't be
// made. It ONLY writes the thumbnail asset (never /index.html), so it can't
// re-trigger itself. Called explicitly after a turn that changed /index.html and
// before publish — never from onFileEvent.

// Web waits a bit longer than the shooter's own hard render cap so a slow-but-
// successful render isn't aborted on our side.
const FETCH_TIMEOUT_MS = 15_000;

export type ThumbnailAsset = {
  mimeType: string;
  size: number;
  hash: string;
};

// A stub of the injected window.artefacts SDK (see app/serve/route.ts): the
// inlined HTML we screenshot has no real bootstrap, so DB-driven apps would throw
// on first use. This lets them paint their static above-the-fold shell instead of
// dying on an unhandled rejection. Returns empty data for every query.
const ARTEFACTS_STUB = (projectId: string): string => {
  const id = JSON.stringify(projectId);
  return (
    `<script>(function(){var q={select:function(){return q;},where:function(){return q;},` +
    `order:function(){return q;},limit:function(){return q;},list:function(){return Promise.resolve([]);},` +
    `get:function(){return Promise.resolve(null);},insert:function(){return Promise.resolve([]);},` +
    `update:function(){return Promise.resolve([]);},delete:function(){return Promise.resolve([]);}};` +
    `window.__ARTEFACTS__={projectId:${id}};` +
    `window.artefacts={projectId:${id},db:{from:function(){return q;}},` +
    `auth:{user:function(){return Promise.resolve(null);},login:function(){return Promise.resolve(null);},` +
    `signup:function(){return Promise.resolve(null);},logout:function(){return Promise.resolve(true);}}};})();</script>`
  );
};

function injectHead(html: string, snippet: string): string {
  const m = html.match(/<head[^>]*>/i);
  if (m) {
    const at = m.index! + m[0].length;
    return html.slice(0, at) + snippet + html.slice(at);
  }
  return snippet + html;
}

export async function generateThumbnail(
  projectId: string,
): Promise<ThumbnailAsset | null> {
  // Kill-switch (admin app_setting, blank → on) and infra URL. Either off → skip.
  if ((await settingString("THUMBNAIL_ENABLED", "on")) === "off") return null;
  const base = process.env.SCREENSHOT_SERVICE_URL?.trim();
  if (!base) return null;
  const secret = process.env.SCREENSHOT_SERVICE_SECRET ?? "";

  const html = await readFile(projectId, "/index.html");
  if (html == null) return null;

  // Fully self-contained HTML: resolve the __SITE_URL__ placeholder to relative,
  // inline every VFS asset (fonts, images) as data URIs, and add the SDK stub.
  let page: string;
  try {
    page = await inlineVfsAssets(projectId, substituteSiteUrl(html, ""));
    page = injectHead(page, ARTEFACTS_STUB(projectId));
  } catch (e) {
    console.error("[thumbnail] failed to build inlined HTML", e);
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}/screenshot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shot-secret": secret },
      body: JSON.stringify({
        html: page,
        width: 1200,
        height: 630,
        deviceScaleFactor: 2,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    console.error("[thumbnail] screenshot request failed", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    console.error("[thumbnail] screenshot service returned", res.status);
    return null;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) return null;
  const base64 = buf.toString("base64");
  await writeBinaryFile(projectId, THUMBNAIL_PATH, base64, "image/png");
  return {
    mimeType: "image/png",
    size: buf.length,
    // sha256 of the stored (base64) content — matches getClientFiles' asset hash.
    hash: createHash("sha256").update(base64).digest("hex"),
  };
}
