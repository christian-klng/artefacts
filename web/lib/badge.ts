// The "Erstellt mit Kubikraum" attribution badge, injected into a generated app's
// HTML at SERVE time only (never written into the VFS) — so it shows on published
// apps and in the live preview, but is absent from the exported ZIP. Injection is
// gated per project by `project.badgeHidden` (future paid-plan removal).
//
// Pure module (no server-only imports) so it can also run in the client srcDoc
// preview fallback (components/sandpack-workspace.tsx).

// Sentinel: presence of this attribute means the badge is already there, so
// injectBadge() is idempotent and safe to call on any path.
const BADGE_MARKER = "data-kubikraum-badge";

// Kubikraum cube mark, dark-background variant (white + yellow faces, white
// outline) — matches the dark pill below. Sized/pinned inline so host-app CSS
// (e.g. `svg{width:100%}`) can't distort it.
const LOGO_SVG =
  '<svg viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ' +
  'style="width:18px!important;height:18px!important;display:block!important;flex:none!important">' +
  '<g stroke="#FFFFFF" stroke-width="24" stroke-linejoin="round">' +
  '<path d="M476.9 210.2Q512 191 547.1 210.2L743.9 317.8Q779 337 743.9 356.1L547.1 462.9Q512 482 476.9 462.9L280.1 356.1Q245 337 280.1 317.8Z" fill="#FFFFFF"/>' +
  '<path d="M529.1 553.6Q530.1 513.6 564.2 492.8L755.4 376.1Q789.5 355.2 788.5 395.2L782.8 619.6Q781.8 659.6 747.9 680.8L556.3 800.5Q522.4 821.8 523.4 781.8Z" fill="#FFFFFF"/>' +
  '<path d="M235.5 395.2Q234.5 355.2 268.6 376.1L459.8 492.8Q493.9 513.6 494.9 553.6L500.6 781.8Q501.6 821.8 467.7 800.5L276.1 680.8Q242.2 659.6 241.2 619.6Z" fill="#FFD166"/>' +
  "</g></svg>";

// A single self-styled anchor. Every layout-critical rule is inline + !important
// so the host app's stylesheet can't move, shrink, hide, or restyle it — inline
// !important wins the cascade even over an app's `!important` rules.
const BADGE_HTML =
  `<a ${BADGE_MARKER} href="https://kubikraum.digital" target="_blank" rel="noopener noreferrer" ` +
  'aria-label="Erstellt mit Kubikraum" ' +
  'style="' +
  "position:fixed!important;bottom:16px!important;right:16px!important;z-index:2147483647!important;" +
  "display:inline-flex!important;align-items:center!important;gap:7px!important;" +
  "margin:0!important;padding:6px 11px 6px 9px!important;max-width:none!important;width:auto!important;height:auto!important;" +
  "box-sizing:border-box!important;border-radius:9999px!important;" +
  "background:#1F2933!important;color:#FFFFFF!important;border:1px solid rgba(255,255,255,.14)!important;" +
  "box-shadow:0 2px 8px rgba(0,0,0,.24),0 1px 2px rgba(0,0,0,.3)!important;" +
  "font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif!important;" +
  "font-size:12px!important;line-height:1!important;font-weight:600!important;letter-spacing:.01em!important;" +
  "text-decoration:none!important;white-space:nowrap!important;cursor:pointer!important;" +
  "opacity:1!important;visibility:visible!important;transform:none!important;-webkit-font-smoothing:antialiased;" +
  '">' +
  LOGO_SVG +
  '<span style="color:#FFFFFF!important;font:inherit!important;">Erstellt mit Kubikraum</span>' +
  "</a>";

/**
 * Insert the Kubikraum attribution badge before `</body>` (fallback: append).
 * Idempotent — if the badge is already present the input is returned unchanged.
 */
export function injectBadge(html: string): string {
  if (html.includes(BADGE_MARKER)) return html;
  // Insert before the LAST </body> so the badge is the last body child.
  const idx = html.lastIndexOf("</body>");
  if (idx !== -1) {
    return html.slice(0, idx) + BADGE_HTML + html.slice(idx);
  }
  return html + BADGE_HTML;
}
