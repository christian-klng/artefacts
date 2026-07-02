// Fixed, offline icon catalogs for the builder agent (no network, MIT-licensed):
//  - Lucide (lucide-static): ~2000 consistent stroke-style UI icons, addressed
//    by their kebab-case name (e.g. "arrow-right").
//  - Simple Icons: ~3400 brand/logo marks, addressed as "brand:<slug>"
//    (e.g. "brand:github").
// Pure module (no "server-only") so the catalog logic stays unit-testable,
// mirroring lib/appdb/sql.ts. Only server code imports it.
import * as lucide from "lucide-static";
import lucideTags from "lucide-static/tags.json";
import * as simpleIcons from "simple-icons";

export const BRAND_PREFIX = "brand:";

type CatalogEntry = {
  /** Canonical name the agent uses: "arrow-right" or "brand:github". */
  name: string;
  /** Ready-to-inline `<svg>` markup using currentColor. */
  svg: string;
  /** Lowercased search terms besides the name itself. */
  terms: string[];
};

function buildCatalog(): Map<string, CatalogEntry> {
  const catalog = new Map<string, CatalogEntry>();

  // Lucide exports PascalCase keys; the reliable kebab name is embedded in
  // each SVG's class attribute ("lucide lucide-arrow-right"). Aliases resolve
  // to the same class, so duplicates collapse naturally via the Map key.
  const tags = lucideTags as Record<string, string[]>;
  for (const svg of Object.values(lucide)) {
    if (typeof svg !== "string") continue;
    const match = svg.match(/class="lucide lucide-([a-z0-9-]+)"/);
    if (!match) continue;
    const name = match[1];
    catalog.set(name, {
      name,
      // The shipped SVGs are pretty-printed across lines; collapse for inlining.
      svg: svg
        .replace(/\n\s*/g, " ")
        .replace(/\s+\/>/g, "/>")
        .replace(/\s+>/g, ">")
        .trim(),
      terms: (tags[name] ?? []).map((t) => t.toLowerCase()),
    });
  }

  for (const icon of Object.values(simpleIcons)) {
    if (typeof icon !== "object" || icon === null) continue;
    const { slug, title, svg } = icon as {
      slug?: string;
      title?: string;
      svg?: string;
    };
    if (!slug || !svg) continue;
    const name = `${BRAND_PREFIX}${slug}`;
    catalog.set(name, {
      name,
      // Brand SVGs ship with viewBox only and no fill — give them the same
      // inline-friendly defaults as Lucide (sizes via CSS, color inherited).
      svg: svg.replace(
        /^<svg /,
        '<svg width="24" height="24" fill="currentColor" ',
      ),
      terms: title ? [title.toLowerCase()] : [],
    });
  }

  return catalog;
}

// Built once per process; ~5k entries of small strings.
let catalogCache: Map<string, CatalogEntry> | null = null;
function catalog(): Map<string, CatalogEntry> {
  catalogCache ??= buildCatalog();
  return catalogCache;
}

export type IconMatch = { name: string; terms: string[] };

/**
 * Fuzzy-searches both icon libraries. Every whitespace-separated query term
 * must match the icon's name or one of its tags (substring); name matches
 * rank above tag-only matches, exact/prefix name matches rank highest.
 */
export function searchIcons(query: string, limit = 24): IconMatch[] {
  // Accept the taught "brand:<slug>" notation in queries too — match on the
  // bare slug (entry names are also compared prefix-stripped below).
  const terms = query
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => (t.startsWith(BRAND_PREFIX) ? t.slice(BRAND_PREFIX.length) : t))
    .filter(Boolean);
  if (terms.length === 0) return [];

  const scored: { entry: CatalogEntry; score: number }[] = [];
  for (const entry of catalog().values()) {
    const bare = entry.name.startsWith(BRAND_PREFIX)
      ? entry.name.slice(BRAND_PREFIX.length)
      : entry.name;
    let score = 0;
    for (const term of terms) {
      if (bare === term) score += 100;
      else if (bare.startsWith(term)) score += 40;
      else if (bare.includes(term)) score += 25;
      else if (entry.terms.some((t) => t === term)) score += 20;
      else if (entry.terms.some((t) => t.includes(term))) score += 10;
      else {
        score = 0;
        break; // every term must match somewhere
      }
    }
    if (score > 0) scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map(({ entry }) => ({ name: entry.name, terms: entry.terms }));
}

export type IconLookup =
  | { name: string; found: true; svg: string }
  | { name: string; found: false; suggestions: string[] };

/** Resolves icon names to inline-ready SVG markup, with suggestions on miss. */
export function getIcons(names: string[]): IconLookup[] {
  return names.map((raw) => {
    const name = raw.trim().toLowerCase();
    const entry = catalog().get(name);
    if (entry) return { name, found: true, svg: entry.svg };
    return {
      name,
      found: false,
      suggestions: searchIcons(name.replace(BRAND_PREFIX, ""), 5).map(
        (m) => m.name,
      ),
    };
  });
}
