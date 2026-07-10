// Guards the SEO/GEO checklist feature (lib/seo-checklist.ts + the /SEO_GEO.md
// report). All unit-level, no service needed:
//   1. evaluateSeo scores a bare page low and a complete website 14/14, and
//      returns `na` (excluded from the score) for the alt-text item when the
//      page has no images.
//   2. composeSeoGeoMd renders truthful checkboxes ([x]/[ ]/[-]), the progress
//      line, is idempotent, and differs by locale (DE/EN).
//   3. parseSiteType/siteTypeNeedsSeo read the /CONCEPT.md marker correctly —
//      only website/hybrid opt into the checklist.
//   4. /SEO_GEO.md is an INTERNAL path (so it's excluded from export/serve/
//      publish exactly like CONCEPT/DESIGN).
//   5. lib/vfs.ts maps `xml` → application/xml, so sitemap.xml serves correctly
//      (source-level: vfs.ts imports server-only and can't be plain-imported).
// Run via `npm run check:seo`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { evaluateSeo, composeSeoGeoMd, parseSiteType, siteTypeNeedsSeo } =
  await import(path.join(webRoot, "lib/seo-checklist.ts"));
const { SEO_GEO_PATH, isInternalVfsPath } = await import(
  path.join(webRoot, "lib/concept.ts")
);

const errors = [];
const assert = (cond, msg) => {
  if (!cond) errors.push(msg);
};

// --- fixtures ---------------------------------------------------------------
const bare = `<!doctype html><html><head><title>x</title></head><body><h1>Hi</h1><img src="a.png"></body></html>`;

const completeHead = `<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bäckerei Sonne — Frisches Brot in Köln</title>
<meta name="description" content="Handwerksbäckerei mit Sauerteigbroten, täglich frisch.">
<link rel="canonical" href="/">
<meta property="og:title" content="Bäckerei Sonne"><meta property="og:description" content="Frisches Brot">
<meta property="og:type" content="website"><meta property="og:url" content="__SITE_URL__/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Bakery","name":"Bäckerei Sonne"}</script>
</head><body><main><nav><a href="/">Start</a></nav><h1>Frisches Brot</h1>`;

const complete = `${completeHead}
<img src="brot.jpg" alt="Ein Laib Sauerteigbrot"></main></body></html>`;

// Same complete page but WITHOUT any <img> — the alt-text item must go `na`.
const noImages = `${completeHead}</main></body></html>`;

const ctxNone = { hasRobots: false, hasSitemap: false, hasLlms: false };
const ctxAll = { hasRobots: true, hasSitemap: true, hasLlms: true };

// --- 1. evaluator -----------------------------------------------------------
const evBare = evaluateSeo(bare, ctxNone);
assert(evBare.total === 14, `bare total should be 14, got ${evBare.total}`);
assert(evBare.done === 2, `bare should score 2 (title+h1), got ${evBare.done}`);
assert(
  evBare.statuses.title === "done" && evBare.statuses.h1 === "done",
  "bare: title and h1 should be done",
);
assert(
  evBare.statuses["img-alt"] === "open",
  "bare: an <img> without alt should be open, not na",
);
assert(
  evBare.statuses["json-ld"] === "open" && evBare.statuses.sitemap === "open",
  "bare: json-ld and sitemap should be open",
);

const evComplete = evaluateSeo(complete, ctxAll);
assert(
  evComplete.done === 14 && evComplete.total === 14,
  `complete page should be 14/14, got ${evComplete.done}/${evComplete.total}`,
);

const evNoImg = evaluateSeo(noImages, ctxAll);
assert(
  evNoImg.statuses["img-alt"] === "na",
  "no-images page: img-alt should be na",
);
assert(
  evNoImg.total === 13 && evNoImg.done === 13,
  `no-images page should be 13/13 (na item excluded), got ${evNoImg.done}/${evNoImg.total}`,
);

// --- 2. composer ------------------------------------------------------------
const mdDe = composeSeoGeoMd(evComplete, { locale: "de" });
assert(mdDe.includes("14 von 14"), "DE composer must show the 14/14 progress line");
assert(
  mdDe.includes("[x]") && !mdDe.includes("[ ]") && !mdDe.includes("[-]"),
  "complete page: every checkbox should be [x]",
);

const mdBareEn = composeSeoGeoMd(evBare, { locale: "en" });
assert(mdBareEn.includes("2 of 14"), "EN composer must show the 2/14 progress line");
assert(mdBareEn.includes("[ ]"), "bare page: some checkboxes should be open");

const mdNa = composeSeoGeoMd(evNoImg, { locale: "de" });
assert(
  mdNa.includes("[-]") && mdNa.includes("nicht zutreffend"),
  "na item must render as [-] with a '(nicht zutreffend)' note",
);

assert(
  composeSeoGeoMd(evBare, { locale: "en" }) ===
    composeSeoGeoMd(evBare, { locale: "en" }),
  "composer must be deterministic/idempotent",
);
assert(
  mdDe !== composeSeoGeoMd(evComplete, { locale: "en" }),
  "DE and EN output must differ (localized)",
);

// --- 3. site-type marker ----------------------------------------------------
assert(parseSiteType("Site type: website") === "website", "parse: website");
assert(parseSiteType("**Site type:** web-app") === "web-app", "parse: web-app (markdown bold)");
assert(parseSiteType("- Site type — hybrid") === "hybrid", "parse: hybrid (dash separator)");
assert(parseSiteType("Site type: web app") === "web-app", "parse: 'web app' with a space");
assert(parseSiteType("no marker in here") === null, "parse: no marker → null");
assert(parseSiteType("Site type: dashboard") === null, "parse: unknown value → null");
assert(
  siteTypeNeedsSeo("website") && siteTypeNeedsSeo("hybrid"),
  "website and hybrid should need SEO",
);
assert(
  !siteTypeNeedsSeo("web-app") && !siteTypeNeedsSeo(null),
  "web-app and null should NOT need SEO",
);

// --- 4. internal-path containment -------------------------------------------
assert(SEO_GEO_PATH === "/SEO_GEO.md", "SEO_GEO_PATH constant mismatch");
assert(
  isInternalVfsPath(SEO_GEO_PATH),
  "/SEO_GEO.md must be internal (excluded from export/serve/publish signature)",
);

// --- 5. sitemap.xml content-type (source-level) -----------------------------
const vfsSrc = readFileSync(path.join(webRoot, "lib/vfs.ts"), "utf8");
assert(
  /\bxml\s*:\s*["']application\/xml/.test(vfsSrc),
  "lib/vfs.ts EXT_CONTENT_TYPE must map `xml` → application/xml (else sitemap.xml serves as octet-stream)",
);

// --- report -----------------------------------------------------------------
if (errors.length > 0) {
  console.error(`✗ check:seo — ${errors.length} failure(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  "✓ check:seo — evaluator (bare 2/14, complete 14/14, na-aware), composer (DE/EN, idempotent), site-type marker, internal path + sitemap content-type all pass",
);
