import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  defaultLocale,
  isLocale,
  LOCALE_COOKIE,
  parseAcceptLanguage,
  type Locale,
} from "./i18n";

// Resolve the active locale for the current request:
//   1) an explicit NEXT_LOCALE cookie (set by the language toggle)
//   2) else the browser's Accept-Language (German → de, otherwise en)
//   3) else the default (de)
// cache() dedupes the cookie/header reads across generateMetadata + layout + page
// within a single request render.
export const resolveLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headerStore = await headers();
  return parseAcceptLanguage(headerStore.get("accept-language")) ?? defaultLocale;
});
