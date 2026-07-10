// Deterministic SEO/GEO checklist over a generated /index.html (+ the presence
// of robots.txt/sitemap.xml/llms.txt). Pure string analysis — no DOM, no
// dependencies — so it runs server-side to auto-maintain the user-facing
// /SEO_GEO.md report every turn, at ZERO LLM cost. It is the mirror image of
// lib/density-lint.ts: density flags "too much" (things to remove), this reports
// COMPLETENESS (things still to add), returning the full status of every item —
// not just failures — so the composed report can render the whole checklist with
// truthful, MEASURED checkmarks (a `[x]` is proven from the markup, not claimed
// by the agent).
//
// Detection is intentionally conservative and fails OPEN: every regex is bounded
// to a single tag (`[^>]*`, never an unbounded lazy `[\s\S]*?` across the doc, so
// no O(n²) backtracking on degenerate agent-authored input), the whole thing is
// size-gated, and unrecognized markup simply yields `open`/`na` rather than a
// false `done`. Only items that can be measured reliably are checklist entries —
// prose-quality guidance (extractable copy, FAQ structure) stays in the system
// prompt, because a checkbox must be provable.

import type { Locale } from "@/lib/i18n";

export type SeoStatus = "done" | "open" | "na";

export type SeoItemId =
  | "title"
  | "description"
  | "lang"
  | "viewport-charset"
  | "og-social"
  | "canonical"
  | "og-url"
  | "h1"
  | "landmarks"
  | "img-alt"
  | "robots"
  | "sitemap"
  | "json-ld"
  | "llms";

type Group = "baseline" | "seo" | "geo";

/** Which sibling SEO files exist in the VFS (the parts a page string can't tell). */
export type SeoContext = {
  hasRobots: boolean;
  hasSitemap: boolean;
  hasLlms: boolean;
};

export type SeoEvaluation = {
  statuses: Record<SeoItemId, SeoStatus>;
  /** Items in `done`. */
  done: number;
  /** Items that count toward the score (`done` + `open`, i.e. `na` excluded). */
  total: number;
};

// Generated pages are far smaller; above this we bail out (fail-open) so a
// pathological input can never stall the shared event loop.
const MAX_CHARS = 2_000_000;

// ---- Site-type marker (written by the agent into /CONCEPT.md) --------------

export type SiteType = "website" | "web-app" | "hybrid";

/**
 * Reads the `Site type: …` marker the agent records in /CONCEPT.md. Tolerant of
 * markdown decoration (`**Site type:** website`, `- Site type — web app`). The
 * marker is the gate: only websites/hybrids get the SEO/GEO report file.
 */
export function parseSiteType(concept: string | null | undefined): SiteType | null {
  if (!concept) return null;
  // Up to 6 non-alphanumeric separator chars (": **", " — ", "-") are allowed
  // between "type" and the value; the class is bounded, so the scan stays linear.
  const m = concept.match(/site\s*type[^a-z0-9]{0,6}(website|web[\s-]?app|hybrid)/i);
  if (!m) return null;
  const v = m[1].toLowerCase().replace(/\s+/g, "-");
  if (v === "website") return "website";
  if (v === "hybrid") return "hybrid";
  return "web-app";
}

/** Websites and hybrids carry the full SEO/GEO checklist; a plain web-app doesn't. */
export function siteTypeNeedsSeo(siteType: SiteType | null): boolean {
  return siteType === "website" || siteType === "hybrid";
}

// ---- Measurement -----------------------------------------------------------

/** All `<meta …>` tags (bounded to each tag, so the scan is linear). */
function metaTags(html: string): string[] {
  return html.match(/<meta\b[^>]*>/gi) ?? [];
}

function linkTags(html: string): string[] {
  return html.match(/<link\b[^>]*>/gi) ?? [];
}

/** An attribute's value from a single tag string, quoted or bare; null if absent. */
function attr(tag: string, name: string): string | null {
  // `name` is always an internal literal (no regex metacharacters).
  const quoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  if (quoted) return quoted[1];
  const bare = tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s"'>]+)`, "i"));
  return bare ? bare[1] : null;
}

/** True when a tag whose `key` attr equals `value` exists (optionally with content). */
function hasTag(
  tags: string[],
  key: "name" | "property" | "rel",
  value: string,
  requireContentAttr = true,
): boolean {
  const contentKey = key === "rel" ? "href" : "content";
  return tags.some((t) => {
    const k = attr(t, key);
    if (!k || k.toLowerCase() !== value.toLowerCase()) return false;
    if (!requireContentAttr) return true;
    const c = attr(t, contentKey);
    return c !== null && c.trim().length > 0;
  });
}

/** Non-empty <title>…</title> text. Linear indexOf, not a lazy regex. */
function hasTitle(html: string, lower: string): boolean {
  const open = lower.indexOf("<title");
  if (open === -1) return false;
  const gt = lower.indexOf(">", open);
  const close = lower.indexOf("</title", gt);
  if (gt === -1 || close === -1) return false;
  return html.slice(gt + 1, close).trim().length > 0;
}

function evalJsonLd(html: string): SeoStatus {
  const m = html.match(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) return "open";
  try {
    const parsed: unknown = JSON.parse(m[1].trim());
    const typed = (o: unknown): boolean =>
      !!o && typeof o === "object" && ("@type" in o || "@graph" in o);
    return (Array.isArray(parsed) ? parsed.some(typed) : typed(parsed))
      ? "done"
      : "open";
  } catch {
    // Present but broken JSON — the box stays open so it gets fixed.
    return "open";
  }
}

function evalImgAlt(html: string): SeoStatus {
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  if (imgs.length === 0) return "na";
  // `alt=""` (decorative) is valid — the attribute merely has to be present.
  return imgs.every((t) => attr(t, "alt") !== null) ? "done" : "open";
}

/**
 * Measures the full checklist against the page + sibling-file context. Every
 * item gets a status; the score excludes `na` items so a page with no images
 * isn't penalized for the alt-text check.
 */
export function evaluateSeo(html: string, ctx: SeoContext): SeoEvaluation {
  const safe = html.length > MAX_CHARS ? "" : html;
  const lower = safe.toLowerCase();
  const metas = metaTags(safe);
  const links = linkTags(safe);

  const statuses: Record<SeoItemId, SeoStatus> = {
    title: hasTitle(safe, lower) ? "done" : "open",
    description: hasTag(metas, "name", "description") ? "done" : "open",
    lang: /<html\b[^>]*\blang\s*=\s*["']?[a-z]/i.test(safe) ? "done" : "open",
    "viewport-charset":
      hasTag(metas, "name", "viewport") && metas.some((t) => /\bcharset\s*=/i.test(t))
        ? "done"
        : "open",
    "og-social":
      hasTag(metas, "property", "og:title") &&
      hasTag(metas, "property", "og:description") &&
      hasTag(metas, "property", "og:type")
        ? "done"
        : "open",
    canonical: hasTag(links, "rel", "canonical") ? "done" : "open",
    "og-url": hasTag(metas, "property", "og:url") ? "done" : "open",
    h1: (safe.match(/<h1[\s>]/gi) ?? []).length === 1 ? "done" : "open",
    landmarks: /<main[\s>]/i.test(safe) ? "done" : "open",
    "img-alt": evalImgAlt(safe),
    robots: ctx.hasRobots ? "done" : "open",
    sitemap: ctx.hasSitemap ? "done" : "open",
    "json-ld": evalJsonLd(safe),
    llms: ctx.hasLlms ? "done" : "open",
  };

  let done = 0;
  let total = 0;
  for (const s of Object.values(statuses)) {
    if (s === "na") continue;
    total++;
    if (s === "done") done++;
  }
  return { statuses, done, total };
}

// ---- Composer (deterministic /SEO_GEO.md) ----------------------------------

type ItemCopy = { title: string; why: string };
type ItemDef = { id: SeoItemId; group: Group; de: ItemCopy; en: ItemCopy };

// Ordered by group; the report renders them in this order. User-facing copy —
// plain language, one line on WHY the item matters.
const ITEMS: ItemDef[] = [
  {
    id: "title",
    group: "baseline",
    de: { title: "Aussagekräftiger Seitentitel (<title>)", why: "Erscheint als Überschrift in Suchergebnissen und im Browser-Tab." },
    en: { title: "Descriptive page title (<title>)", why: "Shown as the headline in search results and the browser tab." },
  },
  {
    id: "description",
    group: "baseline",
    de: { title: "Meta-Beschreibung", why: "Der Vorschautext unter dem Titel in den Suchergebnissen." },
    en: { title: "Meta description", why: "The preview snippet under the title in search results." },
  },
  {
    id: "lang",
    group: "baseline",
    de: { title: "Sprachauszeichnung (<html lang>)", why: "Sagt Suchmaschinen und Screenreadern, in welcher Sprache die Seite ist." },
    en: { title: "Language attribute (<html lang>)", why: "Tells search engines and screen readers the page's language." },
  },
  {
    id: "viewport-charset",
    group: "baseline",
    de: { title: "Viewport- & Zeichensatz-Meta", why: "Korrekte Darstellung auf Mobilgeräten und richtige Zeichenkodierung." },
    en: { title: "Viewport & charset meta", why: "Correct mobile rendering and proper character encoding." },
  },
  {
    id: "og-social",
    group: "baseline",
    de: { title: "Social-Vorschau-Tags (Open Graph)", why: "Titel, Beschreibung und Typ für Vorschau-Karten beim Teilen — das Vorschaubild wird automatisch erzeugt." },
    en: { title: "Social preview tags (Open Graph)", why: "Title, description and type for share cards — the preview image is generated automatically." },
  },
  {
    id: "canonical",
    group: "seo",
    de: { title: "Canonical-URL", why: "Benennt die maßgebliche Adresse und vermeidet Duplicate-Content-Probleme." },
    en: { title: "Canonical URL", why: "Names the authoritative address and avoids duplicate-content issues." },
  },
  {
    id: "og-url",
    group: "seo",
    de: { title: "Absolute og:url", why: "Volle Seiten-URL für Social-Vorschauen (Platzhalter __SITE_URL__ wird beim Veröffentlichen ersetzt)." },
    en: { title: "Absolute og:url", why: "Full page URL for social previews (the __SITE_URL__ placeholder is filled in on publish)." },
  },
  {
    id: "h1",
    group: "seo",
    de: { title: "Genau eine <h1>-Hauptüberschrift", why: "Gibt der Seite eine klare, eindeutige Kernaussage." },
    en: { title: "Exactly one <h1> heading", why: "Gives the page a single, unambiguous main statement." },
  },
  {
    id: "landmarks",
    group: "seo",
    de: { title: "Semantische Struktur (<main>, <nav> …)", why: "Hilft Suchmaschinen und KI, den Aufbau der Seite zu verstehen." },
    en: { title: "Semantic structure (<main>, <nav> …)", why: "Helps search engines and AI understand the page layout." },
  },
  {
    id: "img-alt",
    group: "seo",
    de: { title: "Alt-Texte auf allen Bildern", why: "Beschreiben Bilder für Suchmaschinen und Screenreader." },
    en: { title: "Alt text on all images", why: "Describe images for search engines and screen readers." },
  },
  {
    id: "robots",
    group: "seo",
    de: { title: "robots.txt", why: "Erlaubt Crawlern den Zugriff und verweist auf die Sitemap." },
    en: { title: "robots.txt", why: "Allows crawlers in and points them to the sitemap." },
  },
  {
    id: "sitemap",
    group: "seo",
    de: { title: "sitemap.xml", why: "Listet alle Seiten auf, damit Suchmaschinen sie zuverlässig finden." },
    en: { title: "sitemap.xml", why: "Lists every page so search engines find them reliably." },
  },
  {
    id: "json-ld",
    group: "geo",
    de: { title: "Strukturierte Daten (JSON-LD / Schema.org)", why: "Das stärkste Signal für KI-Antwortmaschinen — macht Fakten maschinenlesbar." },
    en: { title: "Structured data (JSON-LD / Schema.org)", why: "The strongest signal for AI answer engines — makes facts machine-readable." },
  },
  {
    id: "llms",
    group: "geo",
    de: { title: "llms.txt für KI-Crawler", why: "Fasst die Seite kompakt für KI-Systeme wie ChatGPT und Perplexity zusammen." },
    en: { title: "llms.txt for AI crawlers", why: "Summarizes the site compactly for AI systems like ChatGPT and Perplexity." },
  },
];

const GROUP_HEADINGS: Record<Group, Record<Locale, string>> = {
  baseline: { de: "Grundlagen (für jede Seite)", en: "Basics (every page)" },
  seo: { de: "SEO — Suchmaschinen", en: "SEO — search engines" },
  geo: { de: "GEO — KI-Antwortmaschinen", en: "GEO — AI answer engines" },
};

const CHECKBOX: Record<SeoStatus, string> = { done: "[x]", open: "[ ]", na: "[-]" };
const NA_NOTE: Record<Locale, string> = { de: "(nicht zutreffend)", en: "(not applicable)" };

function intro(locale: Locale, done: number, total: number): string {
  if (locale === "de") {
    return [
      "# SEO & GEO — Checkliste",
      "",
      "Diese Datei wird automatisch und **kostenlos** gepflegt und bei jeder Änderung neu gemessen. Bitte nicht von Hand bearbeiten — die Häkchen werden aus deiner Seite berechnet.",
      "",
      "**SEO** (Search Engine Optimization) sorgt dafür, dass klassische Suchmaschinen wie Google deine Seite finden, verstehen und ansprechend in den Ergebnissen darstellen.",
      "**GEO** (Generative Engine Optimization) sorgt dafür, dass KI-Systeme wie ChatGPT, Perplexity und Google AI Overviews deine Inhalte korrekt erfassen und zitieren.",
      "",
      "Zu Beginn sind nur die Grundlagen erfüllt. Möchtest du die offenen Punkte umsetzen lassen, schreib es einfach in den Chat (z. B. „Bitte arbeite die SEO- und GEO-Checkliste ab“) — das führt das LLM aus und verbraucht Guthaben.",
      "",
      `**Fortschritt: ${done} von ${total} Punkten erfüllt.**`,
    ].join("\n");
  }
  return [
    "# SEO & GEO — Checklist",
    "",
    "This file is maintained automatically and **for free**, re-measured on every change. Please don't edit it by hand — the checkmarks are computed from your page.",
    "",
    "**SEO** (Search Engine Optimization) helps classic search engines like Google find, understand and nicely present your page in the results.",
    "**GEO** (Generative Engine Optimization) helps AI systems like ChatGPT, Perplexity and Google AI Overviews correctly capture and cite your content.",
    "",
    "At the start only the basics are covered. To have the open items implemented, just say so in the chat (e.g. \"Please work through the SEO and GEO checklist\") — that runs the LLM and consumes credit.",
    "",
    `**Progress: ${done} of ${total} items completed.**`,
  ].join("\n");
}

/**
 * Renders the /SEO_GEO.md report from a measured evaluation. Deterministic and
 * idempotent (same evaluation + locale → same text): no dates, no randomness.
 */
export function composeSeoGeoMd(
  ev: SeoEvaluation,
  { locale }: { locale: Locale },
): string {
  const sections: string[] = [intro(locale, ev.done, ev.total)];
  for (const group of ["baseline", "seo", "geo"] as const) {
    const lines = ITEMS.filter((it) => it.group === group).map((it) => {
      const status = ev.statuses[it.id];
      const copy = it[locale];
      const note = status === "na" ? ` ${NA_NOTE[locale]}` : "";
      return `- ${CHECKBOX[status]} ${copy.title} — ${copy.why}${note}`;
    });
    sections.push(`## ${GROUP_HEADINGS[group][locale]}\n${lines.join("\n")}`);
  }
  return sections.join("\n\n") + "\n";
}
