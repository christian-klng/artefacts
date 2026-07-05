import { LOCALE_COOKIE, type Locale } from "./index";

const ONE_YEAR = 60 * 60 * 24 * 365;

// Client-only. The locale cookie is deliberately NOT httpOnly so the language
// toggle can set it directly; a reload then re-renders the server tree in the new
// language. `Secure` is only added on https so it still works on http localhost.
export function setLocaleCookie(locale: Locale) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
}
