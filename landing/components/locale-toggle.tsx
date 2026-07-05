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
      className="inline-flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700"
    >
      {LOCALES.map((locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => pick(locale)}
            aria-pressed={isActive}
            className={`px-2 py-1.5 text-xs font-medium uppercase transition ${
              isActive
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
            }`}
          >
            {locale}
          </button>
        );
      })}
    </div>
  );
}
