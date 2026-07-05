// Guards the "Erstellt mit Kubikraum" badge invariant: the badge is injected at
// SERVE/PREVIEW time only, and MUST NOT leak into the exported ZIP. Two checks:
//   1. injectBadge() behaves (inserts before </body>, idempotent, appends when
//      there is no </body>).
//   2. The export route never injects it, while the serve + render routes do —
//      so a future refactor can't silently move the badge into (or out of) the
//      wrong path. Run via `npm run check:badge`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { injectBadge } = await import(
  path.join(webRoot, "lib/badge.ts")
);

const MARKER = "data-kubikraum-badge";
const errors = [];
const assert = (cond, msg) => {
  if (!cond) errors.push(msg);
};

// 1. Behaviour ---------------------------------------------------------------
const withBody = "<html><head></head><body><h1>Hi</h1></body></html>";
const injected = injectBadge(withBody);
assert(injected.includes(MARKER), "injectBadge did not add the badge marker");
assert(
  injected.indexOf(MARKER) < injected.indexOf("</body>"),
  "badge must sit before </body>",
);
assert(
  injectBadge(injected) === injected,
  "injectBadge is not idempotent (double injection)",
);
const noBody = "<div>fragment, no body tag</div>";
assert(
  injectBadge(noBody).startsWith(noBody) && injectBadge(noBody).includes(MARKER),
  "injectBadge should append when there is no </body>",
);
// Realistic export input (a user's own HTML) must not accidentally match.
assert(
  !injectBadge.toString().includes("throw"),
  "sanity: injectBadge should not throw",
);

// 2. Route wiring ------------------------------------------------------------
const read = (p) => readFileSync(path.join(webRoot, p), "utf8");
const exportSrc = read("app/api/projects/export/route.ts");
const serveSrc = read("app/serve/route.ts");
const renderSrc = read("app/api/projects/render/route.ts");

assert(
  !exportSrc.includes("injectBadge") && !exportSrc.includes(MARKER),
  "export route must NOT reference the badge — it would leak into the ZIP",
);
assert(
  serveSrc.includes("injectBadge"),
  "serve route must inject the badge (published + preview)",
);
assert(
  renderSrc.includes("injectBadge"),
  "render route must inject the badge (srcDoc preview fallback)",
);

if (errors.length) {
  console.error("check:badge FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("check:badge OK — badge injects in serve/render, never in export.");
