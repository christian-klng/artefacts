// The builder's canonical public origin, for building absolute redirect targets.
//
// Redirects must NOT be built from `request.nextUrl` / `request.url`: in the
// deployed standalone server the container binds `HOSTNAME=0.0.0.0` (Dockerfile),
// so Next re-derives the request host as `0.0.0.0:3000` and a
// `NextResponse.redirect(new URL(path, request.nextUrl))` sends the browser to
// `http://0.0.0.0:3000/...` (see the Next.js host gotcha in CLAUDE.md). `AUTH_URL`
// is the public https URL set in deployment (and already required by Auth.js), so
// it's the reliable origin. The request-derived `fallbackOrigin` is used only for
// local dev, where AUTH_URL is typically unset and the origin is localhost.
//
// Edge/Node-safe: uses only `URL` + `process.env`, so it's importable from
// `proxy.ts` as well as route handlers.
export function publicOrigin(fallbackOrigin: string): string {
  const authUrl = process.env.AUTH_URL;
  if (authUrl) {
    try {
      return new URL(authUrl).origin;
    } catch {
      // Malformed AUTH_URL — fall through to the request-derived origin.
    }
  }
  return fallbackOrigin;
}
