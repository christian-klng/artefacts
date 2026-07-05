// Pure, dependency-free i18n primitives. This module imports NO dictionaries and
// NO server APIs, so it is safe to import from server code, client components, and
// the (non-existent) proxy alike without pulling either locale's strings or
// next/headers into a client bundle.
export type { Messages } from "./messages/de";

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

// Landing is German-first (kubikraum.digital, German keywords/brand).
export const defaultLocale: Locale = "de";

// Non-signed, non-sensitive preference cookie. Same name across all three apps.
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

// Landing rule: a visitor whose top browser language is German gets German;
// anyone else gets English. Returns null when there's no usable signal so the
// caller can fall back to `defaultLocale`.
export function parseAcceptLanguage(
  header: string | null | undefined,
): Locale | null {
  if (!header) return null;
  const top = header.split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  const primary = top.split("-")[0];
  if (!primary) return null;
  return primary === "de" ? "de" : "en";
}
