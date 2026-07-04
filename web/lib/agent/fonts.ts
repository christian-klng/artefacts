// Fixed, offline font catalog for the builder agent (OFL-licensed, bundled as
// @fontsource npm packages — no network at build or run time). The catalog
// data lives in font-catalog.json (also read by scripts/check-fonts.mjs, which
// verifies every declared cut resolves to a real woff2 in node_modules).
// Pure module (no "server-only") mirroring lib/agent/icons.ts; only server
// code imports it — node:fs keeps it out of client bundles anyway.
import { readFile } from "node:fs/promises";
import path from "node:path";
import catalogData from "./font-catalog.json";

export type FontEntry = {
  /** Catalog id == @fontsource package slug, e.g. "space-grotesk". */
  id: string;
  /** CSS font-family display name, e.g. "Space Grotesk". */
  family: string;
  category: "serif" | "sans" | "display" | "mono" | "slab" | "script";
  /** Style/epoch tags for search and style-world pairing. */
  vibes: string[];
  /** Available normal-style weights (verified against the shipped files). */
  weights: number[];
  /** Available italic weights (empty = family has no italics). */
  italicWeights: number[];
  /** Generic fallback stack to append after the family name. */
  fallback: string;
};

export const FONT_CATALOG = catalogData as FontEntry[];

const byId = new Map(FONT_CATALOG.map((f) => [f.id, f]));

export function getFont(id: string): FontEntry | null {
  return byId.get(id.trim().toLowerCase()) ?? null;
}

export type FontMatch = Pick<
  FontEntry,
  "id" | "family" | "category" | "vibes" | "weights" | "italicWeights"
>;

/**
 * Fuzzy search over id/family/category/vibes; scoring mirrors searchIcons.
 * An empty query lists the whole catalog (it is small), grouped by category.
 */
export function searchFonts(query: string, limit = 30): FontMatch[] {
  const terms = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);

  const toMatch = (f: FontEntry): FontMatch => ({
    id: f.id,
    family: f.family,
    category: f.category,
    vibes: f.vibes,
    weights: f.weights,
    italicWeights: f.italicWeights,
  });

  if (terms.length === 0) {
    return [...FONT_CATALOG]
      .sort(
        (a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id),
      )
      .slice(0, limit)
      .map(toMatch);
  }

  const scored: { entry: FontEntry; score: number }[] = [];
  for (const entry of FONT_CATALOG) {
    const name = entry.family.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (entry.id === term || name === term) score += 100;
      else if (entry.id.startsWith(term) || name.startsWith(term)) score += 40;
      else if (entry.id.includes(term) || name.includes(term)) score += 25;
      else if (entry.category === term) score += 20;
      else if (entry.vibes.some((v) => v === term)) score += 20;
      else if (entry.vibes.some((v) => v.includes(term))) score += 10;
      else {
        score = 0;
        break; // every term must match somewhere
      }
    }
    if (score > 0) scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map(({ entry }) => toMatch(entry));
}

/** One concrete cut of a family: a weight in normal or italic style. */
export type FontCut = { weight: number; italic: boolean };

/** True when the catalog declares this exact cut for the family. */
export function hasCut(entry: FontEntry, cut: FontCut): boolean {
  return (cut.italic ? entry.italicWeights : entry.weights).includes(cut.weight);
}

/** VFS filename convention for a saved cut: "<id>-<weight>[-italic].woff2". */
export function vfsFontFilename(id: string, cut: FontCut): string {
  return `${id}-${cut.weight}${cut.italic ? "-italic" : ""}.woff2`;
}

// The woff2 files are read from node_modules at runtime (NOT statically
// imported), so next.config.ts outputFileTracingIncludes must force
// @fontsource/** into the standalone output. process.cwd() is web/ in dev and
// /app in the Docker runner — node_modules sits next to server.js either way.
function packageFilePath(id: string, cut: FontCut): string {
  const file = `${id}-latin-${cut.weight}-${cut.italic ? "italic" : "normal"}.woff2`;
  return path.join(process.cwd(), "node_modules", "@fontsource", id, "files", file);
}

// Cuts are small (~10-20 KB) and few; cache them for the process lifetime so
// repeated add_font calls and the preview route don't re-read the disk.
const fileCache = new Map<string, { base64: string; bytes: number }>();

/**
 * Loads one verified catalog cut as base64. Throws with an actionable message
 * on unknown families/cuts so the agent tool can surface it directly.
 */
export async function loadFontFile(
  id: string,
  cut: FontCut,
): Promise<{ base64: string; bytes: number }> {
  const entry = getFont(id);
  if (!entry) {
    throw new Error(
      `Unknown font "${id}". Use search_fonts to find valid catalog ids.`,
    );
  }
  if (!hasCut(entry, cut)) {
    const available = cut.italic ? entry.italicWeights : entry.weights;
    throw new Error(
      `${entry.family} has no ${cut.italic ? "italic " : ""}weight ${cut.weight}. ` +
        (available.length > 0
          ? `Available ${cut.italic ? "italic " : ""}weights: ${available.join(", ")}.`
          : `This family has no italic cuts.`),
    );
  }
  const key = vfsFontFilename(id, cut);
  const cached = fileCache.get(key);
  if (cached) return cached;

  const buffer = await readFile(packageFilePath(id, cut));
  const loaded = { base64: buffer.toString("base64"), bytes: buffer.length };
  fileCache.set(key, loaded);
  return loaded;
}

/**
 * Ready-to-inline @font-face CSS for saved cuts, with relative asset urls
 * (resolve on the app's origin and get data-URI-inlined in the srcDoc
 * fallback) plus a usage comment carrying the full font-family stack.
 */
export function fontFaceCss(entry: FontEntry, cuts: FontCut[]): string {
  const faces = cuts.map((cut) => {
    const rel = `assets/fonts/${vfsFontFilename(entry.id, cut)}`;
    return [
      "@font-face {",
      `  font-family: '${entry.family}';`,
      `  src: url('${rel}') format('woff2');`,
      `  font-weight: ${cut.weight};`,
      `  font-style: ${cut.italic ? "italic" : "normal"};`,
      "  font-display: swap;",
      "}",
    ].join("\n");
  });
  return [
    `/* ${entry.family} — use as: font-family: '${entry.family}', ${entry.fallback}; */`,
    ...faces,
  ].join("\n");
}
