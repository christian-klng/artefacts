// Pure helpers for mapping request hostnames to generated apps. Generated apps
// are served from a wildcard sub-zone, `<label>.apps.<APPS_DOMAIN>`; the builder
// itself stays on the main domain. Kept dependency-free so it can run in the
// proxy (Node runtime) and be unit-tested in isolation.
//
// Port is ignored in all comparisons so local dev (apps.localhost:3000) and
// production (apps.example.com) behave the same.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hostname(value: string): string {
  return value.split(":")[0].toLowerCase();
}

/**
 * Returns the sub-zone label for a generated-app request, e.g. "preview-<id>"
 * for `preview-<id>.apps.example.com`. Returns null for the builder/main domain
 * or anything not under the apps sub-zone.
 */
export function parseAppLabel(
  host: string | null | undefined,
  appsDomain: string | null | undefined,
): string | null {
  if (!host || !appsDomain) return null;
  const h = hostname(host);
  const d = hostname(appsDomain);
  if (!d || h === d) return null;
  const suffix = `.${d}`;
  if (!h.endsWith(suffix)) return null;
  const label = h.slice(0, h.length - suffix.length);
  return label.length > 0 ? label : null;
}

/** True if the request targets the generated-apps sub-zone. */
export function isAppHost(
  host: string | null | undefined,
  appsDomain: string | null | undefined,
): boolean {
  return parseAppLabel(host, appsDomain) !== null;
}

/** Extracts the projectId from a `preview-<uuid>` label, or null if invalid. */
export function previewProjectId(label: string | null): string | null {
  if (!label) return null;
  const m = /^preview-(.+)$/.exec(label);
  if (!m) return null;
  return UUID_RE.test(m[1]) ? m[1] : null;
}

/** Builds the origin for a given app label, e.g. https://preview-<id>.apps.x. */
export function buildAppOrigin(appsDomain: string, label: string): string {
  const proto = hostname(appsDomain).endsWith("localhost") ? "http" : "https";
  return `${proto}://${label}.${appsDomain}`;
}
