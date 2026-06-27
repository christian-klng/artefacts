// The agent builds SEO/GEO metadata that needs ABSOLUTE URLs (og:url, og:image,
// sitemap <loc>) but the page's public origin isn't known at build time. So the
// agent writes this placeholder as the origin, and we substitute the real origin
// at delivery time — different per path:
//   - serve route (preview/publish): the actual request host
//   - export:                        the URL the user enters in the modal
// Kept pure (no imports, no "server-only") so both client and server can use it.

export const SITE_URL_TOKEN = "__SITE_URL__";

/**
 * Replaces the build-time origin placeholder with a real origin (which must have
 * NO trailing slash, e.g. "https://example.com"). An empty origin degrades the
 * absolute URLs to relative paths ("__SITE_URL__/x" → "/x") — not ideal, but it
 * never leaks the raw token into a shipped file.
 */
export function substituteSiteUrl(content: string, origin: string): string {
  return content.split(SITE_URL_TOKEN).join(origin);
}

/** True if the text still carries the placeholder (e.g. to decide whether to ask). */
export function hasSiteUrlToken(content: string): boolean {
  return content.includes(SITE_URL_TOKEN);
}

/**
 * Normalizes user-entered text to a bare origin (scheme + host[:port], no path,
 * no trailing slash), or null if it can't be parsed. Assumes https:// when the
 * scheme is omitted.
 */
export function normalizeSiteOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/** Builds the origin for a served request host (http only for *.localhost). */
export function originFromHost(host: string): string {
  const isLocal = host.split(":")[0].endsWith("localhost");
  return `${isLocal ? "http" : "https"}://${host}`;
}
