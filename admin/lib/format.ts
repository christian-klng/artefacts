import type { Locale } from "./i18n";

// Map our app locale to a full BCP-47 locale for Intl.
const INTL_LOCALE: Record<Locale, string> = { de: "de-DE", en: "en-US" };

const eurCache: Partial<Record<Locale, Intl.NumberFormat>> = {};
const dateCache: Partial<Record<Locale, Intl.DateTimeFormat>> = {};

export function formatEur(value: number, locale: Locale = "de"): string {
  const fmt = (eurCache[locale] ??= new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }));
  return fmt.format(value);
}

export function formatDate(value: Date, locale: Locale = "de"): string {
  const fmt = (dateCache[locale] ??= new Intl.DateTimeFormat(
    INTL_LOCALE[locale],
    { dateStyle: "medium", timeStyle: "short" },
  ));
  return fmt.format(value);
}
