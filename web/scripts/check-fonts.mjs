// Verifies the font catalog against the installed @fontsource packages: every
// cut declared in lib/agent/font-catalog.json must resolve to a real woff2
// file in node_modules. Catches package-name/weight typos at dev time instead
// of as runtime tool errors. Run via `npm run check:fonts`.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  readFileSync(path.join(webRoot, "lib/agent/font-catalog.json"), "utf8"),
);

let files = 0;
let bytes = 0;
const missing = [];

for (const entry of catalog) {
  const cuts = [
    ...entry.weights.map((w) => ({ weight: w, italic: false })),
    ...entry.italicWeights.map((w) => ({ weight: w, italic: true })),
  ];
  for (const cut of cuts) {
    const file = `${entry.id}-latin-${cut.weight}-${cut.italic ? "italic" : "normal"}.woff2`;
    const full = path.join(webRoot, "node_modules", "@fontsource", entry.id, "files", file);
    try {
      bytes += statSync(full).size;
      files += 1;
    } catch {
      missing.push(`${entry.id}: ${file}`);
    }
  }
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} declared font cut(s) missing on disk:`);
  for (const m of missing) console.error(`  - ${m}`);
  console.error(
    "\nFix lib/agent/font-catalog.json or install the @fontsource package.",
  );
  process.exit(1);
}

// The style worlds reference fonts by catalog id — a typo there would only
// degrade at runtime (DESIGN.md without family names), so check them here.
// Text-scan of the TS source keeps this script dependency-free.
const catalogIds = new Set(catalog.map((f) => f.id));
const worldsSrc = readFileSync(
  path.join(webRoot, "lib/design-worlds.ts"),
  "utf8",
);
const pairingIds = [
  ...worldsSrc.matchAll(/(?:heading|body|accent):\s*"([a-z0-9-]+)"/g),
].map((m) => m[1]);
const unknownPairings = [...new Set(pairingIds)].filter(
  (id) => !catalogIds.has(id),
);
if (unknownPairings.length > 0) {
  console.error(
    `✗ design-worlds.ts references unknown font ids: ${unknownPairings.join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `✓ font catalog ok: ${catalog.length} families, ${files} cuts, ${(bytes / 1024 / 1024).toFixed(1)} MB total; ` +
    `all ${new Set(pairingIds).size} style-world pairing ids resolve`,
);
