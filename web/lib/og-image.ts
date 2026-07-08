// Server-injected OpenGraph/Twitter image meta, added to a generated app's HTML
// at SERVE time only (like the badge in lib/badge.ts) — never written into the
// VFS, so the exported ZIP stays the user's own markup. The image itself is an
// auto-generated screenshot of the page header, stored in the VFS at
// THUMBNAIL_PATH (see lib/thumbnail.ts) and served as a normal asset.
//
// Pure module (no "server-only") so the constant + injector can be imported from
// both server and pure contexts without pulling in the DB layer.

/** Where the auto-generated OG thumbnail lives in every project's VFS. */
export const THUMBNAIL_PATH = "/assets/og-thumbnail.png";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Drops the image-related OG/Twitter meta tags the agent may have authored (and
// any block we injected on a prior call) so we can replace them with one
// canonical, always-fresh reference. og:title / og:description are left intact.
function stripImageMeta(html: string): string {
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (/property\s*=\s*["']og:image(:[a-z_]+)?["']/i.test(tag)) return "";
    if (/name\s*=\s*["']twitter:(image|card)["']/i.test(tag)) return "";
    return tag;
  });
}

/**
 * Injects og:image + twitter:image meta (pointing at the absolute thumbnail URL)
 * before </head>. No-op when there's no thumbnail or no known origin. Idempotent:
 * it strips any prior image meta (including its own) before injecting, so calling
 * it twice yields the same output.
 */
export function injectOgImage(
  html: string,
  origin: string,
  hasThumbnail: boolean,
): string {
  if (!hasThumbnail || !origin) return html;
  const url = `${origin}${THUMBNAIL_PATH}`;
  const tags =
    `<meta property="og:image" content="${url}">` +
    `<meta property="og:image:secure_url" content="${url}">` +
    `<meta property="og:image:type" content="image/png">` +
    `<meta property="og:image:width" content="${OG_WIDTH}">` +
    `<meta property="og:image:height" content="${OG_HEIGHT}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:image" content="${url}">`;
  const stripped = stripImageMeta(html);
  return stripped.includes("</head>")
    ? stripped.replace("</head>", `${tags}</head>`)
    : `${tags}${stripped}`;
}
