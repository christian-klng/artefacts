// Inline text editing of the live preview. The user toggles "edit mode" in the
// builder; the served /index.html then (a) carries an ephemeral `data-afedit="N"`
// ordinal on every editable *leaf text element* and (b) ships a small runtime
// that turns a click into contentEditable, Enter into a save. On save the runtime
// postMessages `{ordinal, oldText, newText}` to the builder, which re-walks the
// STORED source, verifies `oldText` still matches at that ordinal, and splices the
// escaped new text in (see app/api/projects/inline-edit).
//
// Design constraints (mirrors lib/density-lint.ts / lib/seo-checklist.ts):
//   - Pure, dependency-free, no `server-only` import — importable by the serve
//     route, the render route AND the plain-node check harness.
//   - Bounded, single-pass, FAIL-OPEN: on any ambiguity (malformed markup, a `>`
//     inside an unquoted attribute, a huge document) an element is simply not
//     offered as editable. The walker never throws and never mutates the file.
//   - The real safety net is the SAVE-time `oldText` verification: a mis-scoped
//     range whose text no longer matches the DOM is rejected, so "best-effort"
//     annotation can never corrupt the source.
//
// Only LEAF text elements are editable: an allowlisted tag whose only content is
// text (no child elements). A <p> with a nested <a> is not a leaf (skipped), but
// that <a> is. This keeps every write a clean "replace this element's text".

/** Ephemeral ordinal attribute injected at serve time; read by the runtime. */
export const AFEDIT_ATTR = "data-afedit";

/** Sentinel on the injected runtime <script>, so injection is idempotent. */
const RUNTIME_MARKER = "data-afedit-runtime";

/**
 * Documents larger than this are left un-annotated (edit mode shows nothing
 * editable) rather than risk stalling the shared event loop on a degenerate
 * page. A real generated page's HTML source is far below this.
 */
export const MAX_INLINE_EDIT_HTML = 2 * 1024 * 1024;

// Tags whose sole-text content we offer for inline editing. Deliberately text
// bearing and semantic — layout containers (div/section/header/nav/main/…) and
// list/table wrappers are excluded so the hover glow reads as "editable text",
// not "editable box".
const EDITABLE_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "span", "a", "button", "summary", "label", "legend",
  "li", "dt", "dd",
  "td", "th", "caption", "figcaption",
  "blockquote", "cite", "q", "address", "time",
  "strong", "em", "b", "i", "u", "small", "mark", "abbr", "sub", "sup",
]);

// Void elements never have content; they can't open a scope.
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

// Raw-text elements: their `<...>` content is not markup, so skip to the close.
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);

// Subtrees we skip wholesale — either non-text (svg/math), whitespace-sensitive
// (pre), or inert (template/noscript). Skipping them also means a parent that
// contains one is correctly seen as NOT a leaf.
const SKIP_SUBTREE = new Set(["svg", "math", "pre", "template", "noscript"]);

// A tag at a cursor position: name, attributes (quote-aware so a `>` inside a
// quoted value doesn't end the tag early), and an optional trailing slash.
const TAG_RE = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*)(\/?)>/y;

type Token =
  | { type: "open"; name: string; start: number; end: number }
  | { type: "close"; name: string; start: number; end: number }
  // Comments are skipped (not emitted); opaque = void/self-closing tags and
  // skipped raw-text/subtree regions — they count as "content between siblings"
  // so a parent wrapping one is not mistaken for a leaf.
  | { type: "opaque"; start: number; end: number };

/** Advances past a skipped subtree (`<name>…</name>`), honoring nesting. */
function skipSubtree(html: string, name: string, from: number): number {
  let depth = 1;
  const re = new RegExp("<(/?)" + name + "(?:[\\s/>]|$)", "gi");
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const gt = html.indexOf(">", m.index);
    if (gt === -1) return html.length;
    if (m[1] === "/") {
      depth--;
      if (depth === 0) return gt + 1;
    } else if (html[gt - 1] !== "/") {
      depth++;
    }
    re.lastIndex = gt + 1;
  }
  return html.length;
}

/** Linear tokenizer over the tags of an HTML document (fail-open on anomalies). */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;
    const next = html.charCodeAt(lt + 1);
    if (next === 33 /* ! */) {
      // Comment or declaration (<!--…-->, <!doctype>). Ignorable.
      if (html.startsWith("<!--", lt)) {
        const ce = html.indexOf("-->", lt + 4);
        i = ce === -1 ? n : ce + 3;
      } else {
        const de = html.indexOf(">", lt);
        i = de === -1 ? n : de + 1;
      }
      continue;
    }
    if (next === 63 /* ? */) {
      const pe = html.indexOf(">", lt);
      i = pe === -1 ? n : pe + 1;
      continue;
    }
    TAG_RE.lastIndex = lt;
    const mt = TAG_RE.exec(html);
    if (!mt || mt.index !== lt) {
      i = lt + 1; // a stray '<'
      continue;
    }
    const isClose = mt[1] === "/";
    const name = mt[2].toLowerCase();
    const selfSlash = mt[4] === "/";
    const tagEnd = lt + mt[0].length;

    if (!isClose && RAW_TEXT.has(name)) {
      const rest = html.slice(tagEnd);
      const mm = new RegExp("</" + name + "\\s*>", "i").exec(rest);
      const closeAt = mm ? tagEnd + mm.index + mm[0].length : n;
      tokens.push({ type: "opaque", start: lt, end: closeAt });
      i = closeAt;
      continue;
    }
    if (!isClose && !selfSlash && SKIP_SUBTREE.has(name)) {
      const subEnd = skipSubtree(html, name, tagEnd);
      tokens.push({ type: "opaque", start: lt, end: subEnd });
      i = subEnd;
      continue;
    }
    if (isClose) {
      tokens.push({ type: "close", name, start: lt, end: tagEnd });
    } else if (selfSlash || VOID.has(name)) {
      tokens.push({ type: "opaque", start: lt, end: tagEnd });
    } else {
      tokens.push({ type: "open", name, start: lt, end: tagEnd });
    }
    i = tagEnd;
  }
  return tokens;
}

type Editable = {
  name: string;
  /** Index just after the open tag's `>` (also the inner-content start). */
  openEnd: number;
  innerStart: number;
  innerEnd: number;
  text: string;
};

/**
 * Editable leaf text elements in document order — the single source of truth for
 * ordinals, shared by annotate (serve time) and locate (save time), so the N-th
 * element is the same on both ends.
 */
function collectEditable(html: string): Editable[] {
  if (html.length > MAX_INLINE_EDIT_HTML) return [];
  const tokens = tokenize(html);
  const out: Editable[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== "open" || !EDITABLE_TAGS.has(t.name)) continue;
    const nxt = tokens[k + 1];
    // Leaf iff the very next token is this element's own close tag — anything
    // else (a child element, a skipped subtree) means it's not pure text.
    if (!nxt || nxt.type !== "close" || nxt.name !== t.name) continue;
    const innerStart = t.end;
    const innerEnd = nxt.start;
    if (innerEnd <= innerStart) continue;
    const text = html.slice(innerStart, innerEnd);
    // Non-empty, no leftover markup (e.g. an inner comment), and never a element
    // carrying the __SITE_URL__ placeholder (its DOM text differs from source).
    if (!text.trim()) continue;
    if (text.indexOf("<") !== -1) continue;
    if (text.indexOf("__SITE_URL__") !== -1) continue;
    out.push({ name: t.name, openEnd: t.end, innerStart, innerEnd, text });
  }
  return out;
}

/** Strips any pre-existing ordinal attributes so annotation stays authoritative. */
function stripAnnotations(html: string): string {
  return html.replace(new RegExp("\\s" + AFEDIT_ATTR + '="[^"]*"', "gi"), "");
}

/**
 * Injects `data-afedit="N"` into each editable leaf element's open tag. Ephemeral
 * — only ever added to the SERVED copy, never written to the VFS. Idempotent and
 * fail-open. Ordinals match `locateEditable` because both walk the same source.
 */
export function annotateEditableText(html: string): string {
  const clean = stripAnnotations(html);
  const items = collectEditable(clean);
  if (items.length === 0) return clean;
  // Splice right-to-left so earlier offsets stay valid. Insert before the `>`.
  let out = clean;
  for (let n = items.length - 1; n >= 0; n--) {
    const at = items[n].openEnd - 1;
    out = out.slice(0, at) + ` ${AFEDIT_ATTR}="${n}"` + out.slice(at);
  }
  return out;
}

/**
 * The inner-content range + current text of the N-th editable leaf element in
 * `html`, or null if N is out of range. `html` MUST be the stored source (no
 * annotations, no serve-time transforms) — the same string the save route splices.
 */
export function locateEditable(
  html: string,
  ordinal: number,
): { innerStart: number; innerEnd: number; text: string } | null {
  if (!Number.isInteger(ordinal) || ordinal < 0) return null;
  const items = collectEditable(html);
  const el = items[ordinal];
  if (!el) return null;
  return { innerStart: el.innerStart, innerEnd: el.innerEnd, text: el.text };
}

/** HTML-escapes user text before it is written back into element content. */
export function escapeEditableText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Normalizes for the save-time equality check: decodes the entities a browser's
 * `textContent` would have decoded and collapses whitespace, so the DOM's text
 * (entities decoded, indentation dropped) compares equal to the raw source inner.
 */
export function normalizeForCompare(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    // JS \s matches U+00A0, so this collapse also normalizes the non-breaking
    // space a browser's textContent decodes &nbsp; into.
    .replace(/\s+/g, " ")
    .trim();
}

// The client runtime, injected into the served HTML only in edit mode. Kept as a
// plain-JS string (no template literals / no `${` inside) so the surrounding
// template literal is safe. Runs inside the preview iframe (a different origin
// than the builder), so it talks to the parent purely via postMessage; the
// discriminator `__afedit:1` is mirrored by the parent's message handler in
// components/sandpack-workspace.tsx.
const RUNTIME_BODY = `(function(){
  var ATTR = ${JSON.stringify(AFEDIT_ATTR)};
  var target = "*";
  try { if (document.referrer) target = new URL(document.referrer).origin; } catch (e) {}
  var editing = null;
  var original = "";

  var style = document.createElement("style");
  style.textContent =
    "[" + ATTR + "]{cursor:text}" +
    "[" + ATTR + "]:hover{outline:2px solid #6366f1 !important;outline-offset:2px !important;background:rgba(99,102,241,.06) !important;border-radius:2px}" +
    "[" + ATTR + "][data-afedit-on]{outline:2px solid #6366f1 !important;outline-offset:2px !important;background:rgba(99,102,241,.10) !important}";
  (document.head || document.documentElement).appendChild(style);

  function editableFrom(node){
    while (node && node !== document.body){
      if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute(ATTR)) return node;
      node = node.parentNode;
    }
    return null;
  }
  function stop(el){
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-afedit-on");
  }
  function commit(el){
    var next = el.textContent;
    stop(el);
    if (editing === el) editing = null;
    if (next === original) return;
    try {
      window.parent.postMessage(
        { __afedit: 1, type: "save", ordinal: parseInt(el.getAttribute(ATTR), 10), oldText: original, newText: next },
        target
      );
    } catch (e) {}
  }
  function cancel(el){
    el.textContent = original;
    stop(el);
    if (editing === el) editing = null;
  }
  function begin(el){
    if (editing === el) return;
    if (editing) commit(editing);
    editing = el;
    original = el.textContent;
    el.setAttribute("contenteditable", "true");
    el.setAttribute("data-afedit-on", "1");
    el.focus();
    try {
      var r = document.createRange(); r.selectNodeContents(el);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch (e) {}
  }

  document.addEventListener("click", function(e){
    var el = editableFrom(e.target);
    if (editing && el === editing) return; // caret placement inside the active editor
    if (el){ e.preventDefault(); e.stopPropagation(); begin(el); }
    else if (editing){ commit(editing); }
  }, true);

  document.addEventListener("keydown", function(e){
    if (!editing) return;
    if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); commit(editing); }
    else if (e.key === "Escape"){ e.preventDefault(); cancel(editing); }
  }, true);

  document.addEventListener("focusout", function(e){
    if (editing && e.target === editing) commit(editing);
  }, true);

  window.addEventListener("message", function(e){
    var d = e.data;
    if (!d || d.__afedit !== 1 || d.type !== "revert") return;
    var el = document.querySelector("[" + ATTR + "='" + d.ordinal + "']");
    if (el) el.textContent = d.text;
  });
})();`;

/** The runtime wrapped in a sentinel-marked <script> for idempotent injection. */
export const INLINE_EDIT_RUNTIME = `<script ${RUNTIME_MARKER}>${RUNTIME_BODY}</script>`;

/** Inserts the runtime before </body> (fallback: append). Idempotent. */
export function injectInlineEditRuntime(html: string): string {
  if (html.includes(RUNTIME_MARKER)) return html;
  const idx = html.lastIndexOf("</body>");
  if (idx !== -1) return html.slice(0, idx) + INLINE_EDIT_RUNTIME + html.slice(idx);
  return html + INLINE_EDIT_RUNTIME;
}
