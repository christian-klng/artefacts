"use client";

import { LOCALES, type Locale } from "@/lib/i18n";
import { setLocaleCookie } from "@/lib/i18n/cookie";
import { useLocale, useMessages } from "@/lib/i18n/provider";

// Compact DE|EN switch. Sets the (non-httpOnly) locale cookie client-side and
// reloads so the server re-renders every string in the chosen language.
export function LocaleToggle() {
  const active = useLocale();
  const m = useMessages();

  function pick(locale: Locale) {
    if (locale === active) return;
    setLocaleCookie(locale);
    window.location.reload();
  }

  return (
    <div
      role="group"
      aria-label={m.localeToggle.label}
      className="inline-flex overflow-hidden rounded-lg border border-black/10 dark:border-white/15"
    >
      {LOCALES.map((locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => pick(locale)}
            aria-pressed={isActive}
            className={`px-2 py-1 text-xs font-medium uppercase transition-colors ${
              isActive
                ? "bg-foreground text-background"
                : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
            }`}
          >
            {locale}
          </button>
        );
      })}
    </div>
  );
}
