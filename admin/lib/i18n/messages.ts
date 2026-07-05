import de, { type Messages } from "./messages/de";
import en from "./messages/en";
import { type Locale } from "./index";

// Server-side dictionary lookup. Imports BOTH locales, so only import this from
// server components/actions/metadata — never a client component. The active
// locale's messages are handed to the client via <MessagesProvider> props.
const DICTIONARIES: Record<Locale, Messages> = { de, en };

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale];
}
