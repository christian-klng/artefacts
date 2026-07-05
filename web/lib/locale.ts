import { cache } from "react";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import {
  defaultLocale,
  isLocale,
  LOCALE_COOKIE,
  parseAcceptLanguage,
  type Locale,
} from "./i18n";

// Resolve the active locale for the current request:
//   1) an explicit NEXT_LOCALE cookie (set by the settings toggle or the landing
//      ?lang= handoff) — the fast per-browser path.
//   2) else the logged-in user's stored preference (users.locale). It is NULL
//      until the user picks a language in settings, so an untouched account keeps
//      auto-detecting; a chosen language then follows the user across devices.
//   3) else the browser's Accept-Language (German → de, otherwise en).
//   4) else the German-first default.
// cache() dedupes the cookie/header/session reads across generateMetadata +
// layouts + pages + server actions within a single request render.
export const resolveLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const session = await auth();
  const fromUser = session?.user?.locale;
  if (isLocale(fromUser)) return fromUser;

  const headerStore = await headers();
  return parseAcceptLanguage(headerStore.get("accept-language")) ?? defaultLocale;
});
