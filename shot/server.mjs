// Internal screenshot microservice (Way-3 sibling of landing/ and admin/, served
// from the compose stack, never a standalone Coolify resource, no public domain).
//
// The `web` app builds a project's fully self-contained HTML (all VFS assets
// inlined as data: URIs — see web/lib/vfs.ts inlineVfsAssets) and POSTs it here.
// We render it in a real headless Chromium via page.setContent (so NO network,
// APPS_DOMAIN, preview token or wildcard DNS is needed), screenshot only the top
// 1200x630 region, downscale it, and return a PNG. `web` writes that PNG into the
// project VFS as /assets/og-thumbnail.png and links it in the served <head>.
//
// Fully offline: the input HTML has everything inlined, and the container has no
// egress requirement. Auth is a shared secret in the x-shot-secret header; with
// no secret configured the service refuses every request (closed by default).

import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { chromium } from "playwright";
import sharp from "sharp";

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.SCREENSHOT_SERVICE_SECRET || "";
// Inlined fonts + images make the body large; cap generously but bound it.
const MAX_BODY_BYTES = 32 * 1024 * 1024;
// Bound Chromium RAM on the tight VPS: only a couple of pages render at once.
const MAX_CONCURRENCY = 2;
// Hard ceiling per render so a pathological page can't pin a worker forever.
const RENDER_TIMEOUT_MS = 12_000;

// --- single shared browser, relaunched lazily if it ever dies ---------------
let browserPromise = null;
async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.isConnected()) return b;
    browserPromise = null;
  }
  browserPromise = chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const browser = await browserPromise;
  browser.on("disconnected", () => {
    browserPromise = null;
  });
  return browser;
}

// --- tiny concurrency gate --------------------------------------------------
let active = 0;
const waiters = [];
async function acquire() {
  if (active >= MAX_CONCURRENCY) {
    await new Promise((resolve) => waiters.push(resolve));
  }
  active += 1;
}
function release() {
  active -= 1;
  const next = waiters.shift();
  if (next) next();
}

function secretOk(header) {
  if (!SECRET || typeof header !== "string" || header.length === 0) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(SECRET);
  // timingSafeEqual throws on length mismatch; compare lengths first (the
  // length itself isn't secret) so a wrong-length secret is a clean reject.
  return a.length === b.length && timingSafeEqual(a, b);
}

async function renderScreenshot({ html, width, height, deviceScaleFactor }) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor,
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    // No network: the HTML is fully inlined. "load" fires once inline scripts +
    // data-URI resources are parsed.
    await page.setContent(html, { waitUntil: "load", timeout: 8000 });
    // Let webfonts finish loading and images decode before we shoot, so text
    // isn't captured in its fallback font and images aren't blank.
    await page.evaluate(async () => {
      try {
        await document.fonts.ready;
      } catch {}
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.decode().catch(() => {}),
        ),
      );
    });
    // Freeze animations/transitions so we don't capture a mid-animation frame.
    await page.addStyleTag({
      content:
        "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
    });
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    // clip (not fullPage) → only the top-of-page / header region, at DSF so the
    // capture is 2x and downsamples crisply.
    const raw = await page.screenshot({
      clip: { x: 0, y: 0, width, height },
      type: "png",
    });
    return await sharp(raw)
      .resize(width, height, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } finally {
    await context.close().catch(() => {});
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "text/plain", ...headers });
    res.end(body);
  };

  if (req.method === "GET" && req.url === "/health") {
    const b = browserPromise ? await browserPromise.catch(() => null) : null;
    // Healthy even before the first render (lazy launch) — only unhealthy if a
    // launched browser has since died.
    const ok = !browserPromise || (b && b.isConnected());
    return send(ok ? 200 : 503, ok ? "ok" : "browser down");
  }

  if (req.method !== "POST" || req.url !== "/screenshot") {
    return send(404, "not found");
  }
  if (!secretOk(req.headers["x-shot-secret"])) {
    return send(401, "unauthorized");
  }

  let payload;
  try {
    payload = JSON.parse((await readBody(req)).toString("utf8"));
  } catch (e) {
    return send(e.message === "payload too large" ? 413 : 400, "bad request");
  }
  const html = typeof payload.html === "string" ? payload.html : "";
  if (!html) return send(400, "missing html");
  const width = clampInt(payload.width, 1200, 320, 2000);
  const height = clampInt(payload.height, 630, 200, 2000);
  const deviceScaleFactor = clampInt(payload.deviceScaleFactor, 2, 1, 3);

  await acquire();
  try {
    const png = await withTimeout(
      renderScreenshot({ html, width, height, deviceScaleFactor }),
      RENDER_TIMEOUT_MS,
    );
    res.writeHead(200, {
      "content-type": "image/png",
      "cache-control": "no-store",
    });
    res.end(png);
  } catch (e) {
    console.error("[shot] render failed:", e?.message || e);
    send(500, "render failed");
  } finally {
    release();
  }
});

function clampInt(value, fallback, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("render timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[shot] listening on :${PORT}` + (SECRET ? "" : " (NO SECRET SET — all requests refused)"));
});
