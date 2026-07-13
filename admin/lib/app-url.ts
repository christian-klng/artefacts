// Builds the public URL of a published app, `https://<slug>.<APPS_DOMAIN>`.
// Mirrors web/lib/app-host.ts `buildAppOrigin` (http for localhost so local
// docker compose links work). Returns null when APPS_DOMAIN isn't configured
// for the admin container — callers fall back to a plain, non-linked badge.
export function publishedAppUrl(slug: string | null): string | null {
  const appsDomain = process.env.APPS_DOMAIN;
  if (!slug || !appsDomain) return null;
  const proto = appsDomain.split(":")[0].toLowerCase().endsWith("localhost")
    ? "http"
    : "https";
  return `${proto}://${slug}.${appsDomain}`;
}
