// Guards the OG-thumbnail feature. Two parts:
//   1. Unit: injectOgImage() links the thumbnail as og:image/twitter:image,
//      strips prior image meta (dedup / idempotent), keeps og:title, and is a
//      no-op without a thumbnail. Plus route wiring — serve injects it, export
//      must NOT (serve-time only, like the badge, so the ZIP stays the user's
//      markup).
//   2. Integration (only when SCREENSHOT_SERVICE_URL is set, e.g. on the server
//      with the `shot` container up): the service is healthy, returns a real
//      1200x630 PNG, and rejects a wrong/missing secret. Skipped otherwise so
//      the unit gate still runs in plain CI.
// Run via `npm run check:thumbnail`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { injectOgImage, THUMBNAIL_PATH } = await import(
  path.join(webRoot, "lib/og-image.ts")
);

const errors = [];
const assert = (cond, msg) => {
  if (!cond) errors.push(msg);
};

// 1. injectOgImage behaviour --------------------------------------------------
const ORIGIN = "https://demo.apps.example.com";
const IMG = `${ORIGIN}${THUMBNAIL_PATH}`;

// No-op without a thumbnail.
const plain = "<html><head><title>Hi</title></head><body>x</body></html>";
assert(
  injectOgImage(plain, ORIGIN, false) === plain,
  "injectOgImage must be a no-op when hasThumbnail is false",
);
// No-op without an origin.
assert(
  injectOgImage(plain, "", true) === plain,
  "injectOgImage must be a no-op when origin is empty",
);

// Injects absolute og:image + twitter meta before </head>.
const injected = injectOgImage(plain, ORIGIN, true);
assert(
  injected.includes(`<meta property="og:image" content="${IMG}">`),
  "injectOgImage must add an absolute og:image",
);
assert(
  injected.includes(`<meta name="twitter:card" content="summary_large_image">`),
  "injectOgImage must add the twitter:card",
);
assert(
  injected.includes(`<meta name="twitter:image" content="${IMG}">`),
  "injectOgImage must add twitter:image",
);
assert(
  injected.indexOf("og:image") < injected.indexOf("</head>"),
  "og:image must sit before </head>",
);
assert(
  injected.includes("<title>Hi</title>"),
  "injectOgImage must not disturb existing head content",
);

// Idempotent + dedup: a second pass yields the same result, and an agent's own
// og:image/twitter tags are replaced (not duplicated).
assert(
  injectOgImage(injected, ORIGIN, true) === injected,
  "injectOgImage must be idempotent",
);
const authored =
  '<html><head><meta property="og:title" content="Keep me">' +
  '<meta property="og:image" content="/assets/old.png">' +
  '<meta name="twitter:image" content="/assets/old.png">' +
  '<meta name="twitter:card" content="summary"></head><body>x</body></html>';
const replaced = injectOgImage(authored, ORIGIN, true);
assert(
  !replaced.includes("/assets/old.png"),
  "injectOgImage must strip the agent's prior og:image/twitter:image",
);
assert(
  (replaced.match(/property="og:image"/g) || []).length === 1,
  "injectOgImage must not duplicate og:image",
);
assert(
  replaced.includes('<meta property="og:title" content="Keep me">'),
  "injectOgImage must preserve og:title/og:description",
);
assert(
  (replaced.match(/name="twitter:card"/g) || []).length === 1,
  "injectOgImage must collapse to a single twitter:card",
);

// No </head> → prepend (still injects).
const noHead = "<div>fragment</div>";
assert(
  injectOgImage(noHead, ORIGIN, true).includes("og:image") &&
    injectOgImage(noHead, ORIGIN, true).endsWith(noHead),
  "injectOgImage must prepend when there is no </head>",
);

// 2. Route wiring -------------------------------------------------------------
const read = (p) => readFileSync(path.join(webRoot, p), "utf8");
const serveSrc = read("app/serve/route.ts");
const exportSrc = read("app/api/projects/export/route.ts");

assert(
  serveSrc.includes("injectOgImage"),
  "serve route must inject the OG image (published + preview)",
);
assert(
  !exportSrc.includes("injectOgImage"),
  "export route must NOT inject OG meta — it would leak serve-time tags into the ZIP",
);

// 3. Live service (optional) --------------------------------------------------
const base = process.env.SCREENSHOT_SERVICE_URL?.trim();
if (!base) {
  console.log(
    "check:thumbnail: SCREENSHOT_SERVICE_URL unset — skipping live shot integration.",
  );
} else {
  const secret = process.env.SCREENSHOT_SERVICE_SECRET ?? "";
  const sample =
    "<!doctype html><html><head><style>body{margin:0}h1{font:48px sans-serif;padding:80px}</style>" +
    "</head><body><h1>Hello thumbnail</h1></body></html>";

  try {
    const health = await fetch(`${base}/health`);
    assert(health.ok, `shot /health returned ${health.status}`);
  } catch (e) {
    errors.push(`shot /health unreachable: ${e.message}`);
  }

  // Wrong secret → 401.
  try {
    const bad = await fetch(`${base}/screenshot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shot-secret": "nope" },
      body: JSON.stringify({ html: sample }),
    });
    assert(bad.status === 401, `wrong secret should 401, got ${bad.status}`);
  } catch (e) {
    errors.push(`shot screenshot (bad secret) failed: ${e.message}`);
  }

  // Real secret → a 1200x630 PNG.
  try {
    const res = await fetch(`${base}/screenshot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shot-secret": secret },
      body: JSON.stringify({ html: sample }),
    });
    assert(res.ok, `screenshot returned ${res.status}`);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const { default: sharp } = await import("sharp");
      const meta = await sharp(buf).metadata();
      assert(meta.format === "png", `expected png, got ${meta.format}`);
      assert(
        meta.width === 1200 && meta.height === 630,
        `expected 1200x630, got ${meta.width}x${meta.height}`,
      );
    }
  } catch (e) {
    errors.push(`shot screenshot (valid) failed: ${e.message}`);
  }
}

if (errors.length) {
  console.error("check:thumbnail FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("check:thumbnail OK");
