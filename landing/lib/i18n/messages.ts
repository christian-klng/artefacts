import de, { type Messages } from "./messages/de";
import en from "./messages/en";
import { type Locale } from "./index";

// Server-side dictionary lookup. Because this module statically imports BOTH
// locales, it must only be imported from server components/metadata — never from
// a client component. The active locale's messages are passed to the client via
// <MessagesProvider> props, so only one locale ships to the browser.
const DICTIONARIES: Record<Locale, Messages> = { de, en };

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale];
}
