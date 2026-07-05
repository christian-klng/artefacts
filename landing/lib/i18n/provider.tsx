"use client";

import { createContext, useContext } from "react";
import type { Locale } from "./index";
import type { Messages } from "./messages/de";

// `import type` above keeps both dictionaries out of the client bundle — only the
// active `messages` object, passed as a prop from the server, is shipped.
type I18nValue = { locale: Locale; messages: Messages };

const I18nContext = createContext<I18nValue | null>(null);

export function MessagesProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, messages }}>
      {children}
    </I18nContext.Provider>
  );
}

function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useMessages/useLocale must be used within a MessagesProvider");
  }
  return ctx;
}

export function useMessages(): Messages {
  return useI18n().messages;
}

export function useLocale(): Locale {
  return useI18n().locale;
}
