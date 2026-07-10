// Deterministic content-density lint over a generated /index.html: catches the
// "too much" failure mode of LLM pages (crowded nav, the same CTA button in
// header AND hero, run-on hero headlines, section bloat) with pure string
// analysis — no DOM, no dependencies, so it runs server-side in tool results
// and per-turn context, and could bundle client-side later. Thresholds are
// deliberately LOOSE: only egregious violations flag, so deliberately dense
// design worlds (terminal-mono, brutalist-web, industrial-utility) stay clear.
// Every check fails open — markup the scanners don't recognize (JS-rendered
// navs, non-<section> layouts) simply produces no finding.
//
// The scanners are hand-rolled indexOf loops instead of lazy `[\s\S]*?`
// regexes ON PURPOSE: this runs synchronously on the shared event loop for
// agent-authored (i.e. user-influenced) content, and lazy patterns go O(n²)
// on degenerate input (many opener tags with no closer — ~1s at 200KB,
// ~26s at 1MB when benchmarked). Keep every scan linear and every regex free
// of unbounded backtracking; MAX_LINT_CHARS is the belt-and-braces cap.

export type DensityRule =
  | "nav-count"
  | "cta-duplicate"
  | "hero-length"
  | "section-count";

export type DensityFinding = {
  rule: DensityRule;
  /** The measured fact, e.g. `7 links in the first <nav>`. */
  measured: string;
  /** What to do about it (incl. when to ignore it). */
  hint: string;
};

// Flag at count > NAV_MAX_LINKS links inside <nav>, > H1_MAX_WORDS words in
// the first <h1>, > SECTION_MAX visible <section> blocks.
const NAV_MAX_LINKS = 5;
const H1_MAX_WORDS = 12;
const SECTION_MAX = 7;
// The duplicate-CTA check compares the header only against the region right
// below it (≈ the hero), cut at the first <footer>/<dialog> — a repeated CTA
// at the page's natural end, in the footer, or in a modal is legitimate.
const HERO_REGION_CHARS = 5000;
const HEADER_SCAN_CHARS = 8000;
// Labels shorter than this are icon buttons/burgers, not CTAs.
const MIN_LABEL_CHARS = 4;
const MAX_LABEL_CHARS = 60;
// Skip the lint entirely above this size (generated pages are far smaller).
const MAX_LINT_CHARS = 1_000_000;
// How far into a tag we look for its closing `>` (attribute region).
const TAG_ATTR_SCAN_CHARS = 500;

type Noise = { open: string; close: string; closeIsTag: boolean };
const NOISE: Noise[] = [
  { open: "<!--", close: "-->", closeIsTag: false },
  { open: "<script", close: "</script", closeIsTag: true },
  { open: "<style", close: "</style", closeIsTag: true },
];

/** Comments, scripts and styles out — inline JS template literals full of
 *  markup would otherwise count as page structure. Linear: the per-needle
 *  search positions are memoized and only ever move forward. */
function stripNoise(html: string, lower: string): string {
  let out = "";
  let i = 0;
  const next = NOISE.map((n) => lower.indexOf(n.open));
  while (i < html.length) {
    let pick = -1;
    for (let n = 0; n < NOISE.length; n++) {
      if (next[n] !== -1 && next[n] < i)
        next[n] = lower.indexOf(NOISE[n].open, i);
      if (next[n] !== -1 && (pick === -1 || next[n] < next[pick])) pick = n;
    }
    if (pick === -1) {
      out += html.slice(i);
      break;
    }
    const noise = NOISE[pick];
    const at = next[pick];
    out += html.slice(i, at) + " ";
    const close = lower.indexOf(noise.close, at + noise.open.length);
    if (close === -1) break; // unclosed block: drop the rest (fails open)
    if (noise.closeIsTag) {
      const gt = lower.indexOf(">", close + noise.close.length);
      i = gt === -1 ? html.length : gt + 1;
    } else {
      i = close + noise.close.length;
    }
  }
  return out;
}

function textOf(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `ch` may follow a tag name (so `<nav>` matches, `<navx>` not). */
function endsTagName(ch: string): boolean {
  return ch !== "" && " \t\n\r\f\v/>".includes(ch);
}

/** The first `<tag …>…</tag>` block, or null. Linear indexOf scan. */
function firstBlock(
  html: string,
  lower: string,
  tag: string,
): string | null {
  const open = "<" + tag;
  let idx = lower.indexOf(open);
  while (idx !== -1 && !endsTagName(lower.charAt(idx + open.length))) {
    idx = lower.indexOf(open, idx + 1);
  }
  if (idx === -1) return null;
  const close = lower.indexOf("</" + tag, idx + open.length);
  if (close === -1) return null;
  const gt = lower.indexOf(">", close);
  return html.slice(idx, gt === -1 ? html.length : gt + 1);
}

// Only elements that LOOK like buttons count as CTAs — plain header nav
// anchors sharing a label with a hero link (nav "Menü" + hero link "Menü")
// are normal and must not flag. `\b` after the tag group so <abbr>/<aside>/
// <animate> can't mispair with a later </a> and swallow real links.
const CTA_TAG = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
const BUTTONISH =
  /\bclass\s*=\s*["'][^"']*(btn|button|cta|action)|\brole\s*=\s*["']button/i;

/** Normalized labels of button-like <a>/<button> elements. Call only on
 *  slices capped to a few KB — the lazy body scan is bounded by slice size. */
function ctaButtonLabels(markup: string): string[] {
  return [...markup.matchAll(CTA_TAG)]
    .filter((m) => m[1].toLowerCase() === "button" || BUTTONISH.test(m[2]))
    .map((m) => textOf(m[3]).toLowerCase())
    .filter((t) => t.length >= MIN_LABEL_CHARS && t.length <= MAX_LABEL_CHARS);
}

/** Visible <section> openers — `hidden`-marked ones (router views, closed
 *  tabpanels: `<section class="page" hidden>`) are app screens, not scroll
 *  density. Linear indexOf scan with a capped attribute window. */
function countVisibleSections(lower: string): number {
  let count = 0;
  let i = lower.indexOf("<section");
  while (i !== -1) {
    if (endsTagName(lower.charAt(i + 8))) {
      const attrs = lower.slice(i + 8, i + 8 + TAG_ATTR_SCAN_CHARS);
      const gt = attrs.indexOf(">");
      const tag = gt === -1 ? attrs : attrs.slice(0, gt);
      if (!tag.includes("hidden")) count++;
    }
    i = lower.indexOf("<section", i + 8);
  }
  return count;
}

export function lintDensity(html: string): DensityFinding[] {
  const findings: DensityFinding[] = [];
  if (html.length > MAX_LINT_CHARS) return findings;
  const clean = stripNoise(html, html.toLowerCase());
  const lower = clean.toLowerCase();

  // Crowded navigation — only a real <nav> is counted (a raw <header> also
  // carries logo + CTA links and would false-positive).
  const nav = firstBlock(clean, lower, "nav");
  if (nav) {
    const links = (nav.match(/<a[\s>]/gi) ?? []).length;
    if (links > NAV_MAX_LINKS) {
      findings.push({
        rule: "nav-count",
        measured: `${links} links in the first <nav>`,
        hint: "real sites carry 3–5 — merge or cut the weakest items",
      });
    }
  }

  // The same CTA as a button in header AND hero.
  const header = firstBlock(clean, lower, "header");
  if (header) {
    const start = clean.indexOf(header) + header.length;
    let heroRegion = clean.slice(start, start + HERO_REGION_CHARS);
    const cutAt = heroRegion.toLowerCase().search(/<(footer|dialog)[\s>]/);
    if (cutAt !== -1) heroRegion = heroRegion.slice(0, cutAt);
    const inHeader = new Set(ctaButtonLabels(header.slice(0, HEADER_SCAN_CHARS)));
    const duplicate =
      inHeader.size > 0
        ? ctaButtonLabels(heroRegion).find((t) => inHeader.has(t))
        : undefined;
    if (duplicate) {
      findings.push({
        rule: "cta-duplicate",
        measured: `"${duplicate}" is a button in the header AND again right below it`,
        hint: "on a page, keep ONE primary CTA (the hero one) and demote or drop the header duplicate; an app toolbar action repeated in an empty state is fine — then ignore this",
      });
    }
  }

  // Run-on hero headline.
  const h1 = firstBlock(clean, lower, "h1");
  if (h1) {
    const words = textOf(h1).split(" ").filter(Boolean).length;
    if (words > H1_MAX_WORDS) {
      findings.push({
        rule: "hero-length",
        measured: `the <h1> runs ${words} words`,
        hint: "a headline lands in ≤ ~8 words — move the rest to ONE supporting sentence",
      });
    }
  }

  // Section bloat.
  const sections = countVisibleSections(lower);
  if (sections > SECTION_MAX) {
    findings.push({
      rule: "section-count",
      measured: `${sections} <section> blocks`,
      hint: "on a scrolling page, cut or merge until every section earns its place; separate views/screens of a multi-view app are fine — then ignore this",
    });
  }

  return findings;
}

/** The advisory block appended to a write_file/edit_file tool result. */
export function formatDensityNote(findings: DensityFinding[]): string {
  return (
    "Density check — measured from what you just wrote; a real site would be edited tighter:\n" +
    findings.map((f) => `- ${f.measured} — ${f.hint}`).join("\n") +
    "\nFix this with edit_file before ending the turn — unless the design DNA or the user's request explicitly covers it (something the user asked for is never a defect)."
  );
}
