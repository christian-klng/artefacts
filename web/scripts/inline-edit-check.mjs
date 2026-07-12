// Guards the inline-edit walker (lib/inline-edit.ts): the invariant is that the
// SAVE path can never corrupt a file. Concretely:
//   1. annotate injects one sequential data-afedit per editable LEAF text element
//      and nothing else (no child-having parents, no skip regions, no empties).
//   2. locate(N) + splice round-trips: replacing the N-th element's text changes
//      exactly that element and leaves the rest byte-identical.
//   3. the DOM-text vs source-inner equality check (normalizeForCompare) holds
//      across entities/whitespace, and mismatches are detectable (→ stale reject).
//   4. everything fails open (never throws) on malformed / adversarial markup.
// Run via `npm run check:inline-edit`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  annotateEditableText,
  locateEditable,
  escapeEditableText,
  normalizeForCompare,
  injectInlineEditRuntime,
  INLINE_EDIT_RUNTIME,
  AFEDIT_ATTR,
} = await import(path.join(webRoot, "lib/inline-edit.ts"));

const errors = [];
const assert = (cond, msg) => {
  if (!cond) errors.push(msg);
};

// Count injected ordinals + assert they are 0..n-1 in order.
function ordinals(html) {
  const re = new RegExp(AFEDIT_ATTR + '="(\\d+)"', "g");
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(Number(m[1]));
  return out;
}

// Simulate the server save: replace the N-th element's inner with new text.
function applyEdit(html, ordinal, newText) {
  const loc = locateEditable(html, ordinal);
  if (!loc) return null;
  return (
    html.slice(0, loc.innerStart) +
    escapeEditableText(newText) +
    html.slice(loc.innerEnd)
  );
}

// 1. Basic annotate + leaf detection --------------------------------------
{
  const html =
    "<html><body>" +
    "<h1>Hello</h1>" +
    "<p>A <a href='/x'>link</a> here</p>" + // <p> not a leaf; <a> is
    "<div>plain</div>" + // div excluded from the allowlist
    "<button><svg><path/></svg> Save</button>" + // icon button → not a leaf
    "<button>Click</button>" + // pure-text button → editable
    "<span>   </span>" + // whitespace-only → skipped
    "<li>Item</li>" +
    "</body></html>";
  const out = annotateEditableText(html);
  const ords = ordinals(out);
  assert(
    ords.length === 4,
    `expected 4 editable elements, got ${ords.length} (${ords})`,
  );
  assert(
    ords.join(",") === "0,1,2,3",
    `ordinals must be sequential 0..n-1, got ${ords}`,
  );
  // The right elements: h1 Hello, a link, button Click, li Item.
  assert(/<h1 [^>]*data-afedit="0"[^>]*>Hello<\/h1>/.test(out), "h1 not tagged 0");
  assert(/<a [^>]*data-afedit="1"[^>]*>link<\/a>/.test(out), "a not tagged 1");
  assert(
    !/<div [^>]*data-afedit/.test(out),
    "div must NOT be editable (excluded tag)",
  );
  assert(
    !/<button [^>]*data-afedit="[^"]*"[^>]*><svg/.test(out),
    "icon button (svg child) must NOT be a leaf",
  );
  assert(/data-afedit="2"[^>]*>Click<\/button>/.test(out), "text button not tagged 2");
  assert(/data-afedit="3"[^>]*>Item<\/li>/.test(out), "li not tagged 3");
}

// 2. locate(N) + splice round-trips, touching only the target -------------
{
  const html =
    "<body><h1>Title</h1><p>keep me</p><h2>Second</h2></body>";
  // Ordinal 0 = h1 "Title", 1 = p "keep me", 2 = h2 "Second".
  const edited = applyEdit(html, 2, "Third");
  assert(
    edited === "<body><h1>Title</h1><p>keep me</p><h2>Third</h2></body>",
    `splice changed the wrong bytes: ${edited}`,
  );
  // Re-locating the same ordinal now returns the NEW text.
  assert(
    locateEditable(edited, 2)?.text === "Third",
    "re-locate after edit did not reflect the new text",
  );
  // Untouched siblings still locate to their original text.
  assert(locateEditable(edited, 0)?.text === "Title", "sibling 0 drifted");
  assert(locateEditable(edited, 1)?.text === "keep me", "sibling 1 drifted");
}

// 3. Entities + whitespace: DOM text vs source inner compare equal ---------
{
  const source = "<h1>\n      A &amp; B\n    </h1>"; // indented + entity
  const loc = locateEditable(source, 0);
  assert(loc !== null, "entity heading should be editable");
  // A browser's textContent for this element (decoded, includes indentation).
  const domText = "\n      A & B\n    ";
  assert(
    normalizeForCompare(loc.text) === normalizeForCompare(domText),
    "normalizeForCompare must equate source '&amp;' with DOM '&'",
  );
  // A genuinely different text must NOT compare equal (→ stale reject works).
  assert(
    normalizeForCompare(loc.text) !== normalizeForCompare("A or B"),
    "normalizeForCompare must distinguish real differences",
  );
  // Writing "<A & B>" escapes to markup-safe source.
  assert(
    escapeEditableText("<A & B>") === "&lt;A &amp; B&gt;",
    "escapeEditableText must escape & < >",
  );
  const edited = applyEdit(source, 0, "C & <D>");
  assert(
    edited === "<h1>C &amp; &lt;D&gt;</h1>",
    `entity write produced: ${edited}`,
  );
}

// 4. Skip regions never get annotated -------------------------------------
{
  const html =
    "<body>" +
    "<script>var s='<h1>not real</h1>'</script>" +
    "<style>.x::before{content:'<p>x</p>'}</style>" +
    "<pre><span>preformatted</span></pre>" +
    "<svg><text>label</text></svg>" +
    "<h1>real</h1>" +
    "</body>";
  const out = annotateEditableText(html);
  const ords = ordinals(out);
  assert(
    ords.length === 1,
    `only the real <h1> should be editable, got ${ords.length}`,
  );
  assert(/data-afedit="0"[^>]*>real<\/h1>/.test(out), "the real h1 wasn't tagged");
  assert(
    out.includes("<h1>not real</h1>") && out.includes("<text>label</text>"),
    "skip-region contents must be left untouched",
  );
}

// 5. __SITE_URL__, idempotency, runtime injection -------------------------
{
  const withPlaceholder = "<body><p>See __SITE_URL__/x</p><h1>OK</h1></body>";
  const out = annotateEditableText(withPlaceholder);
  assert(
    ordinals(out).length === 1 && /data-afedit="0"[^>]*>OK<\/h1>/.test(out),
    "elements carrying __SITE_URL__ must be skipped",
  );

  const page = "<body><h1>Hi</h1></body>";
  const once = annotateEditableText(page);
  const twice = annotateEditableText(once); // strips + re-annotates
  assert(once === twice, "annotate must be idempotent");

  const injected = injectInlineEditRuntime(page);
  assert(
    injected.includes(INLINE_EDIT_RUNTIME) &&
      injected.indexOf(INLINE_EDIT_RUNTIME) < injected.indexOf("</body>"),
    "runtime must be injected before </body>",
  );
  assert(
    injectInlineEditRuntime(injected) === injected,
    "runtime injection must be idempotent",
  );
  assert(
    !INLINE_EDIT_RUNTIME.includes("${"),
    "runtime must not contain an un-interpolated template placeholder",
  );
}

// 6. Fail-open on malformed / adversarial markup (never throws) ------------
{
  const nasty = [
    "<h1>unclosed",
    "<a title='a > b'>quoted gt</a>", // > inside a quoted attr
    "<h1><h2>weird</h1></h2>",
    "<<<>>><p>",
    "<button onclick=\"x>y\">Go</button>",
    "".padEnd(1000, "<p>x"), // many opens, no closes
  ];
  for (const s of nasty) {
    try {
      const a = annotateEditableText(s);
      locateEditable(a, 0);
      locateEditable(s, 999);
    } catch (e) {
      assert(false, `walker threw on: ${JSON.stringify(s).slice(0, 40)} — ${e}`);
    }
  }
  // The quote-aware tag scanner keeps the '>' inside the attribute intact.
  const gt = annotateEditableText("<a title='a > b'>quoted gt</a>");
  assert(
    gt.includes("title='a > b'") && /data-afedit="0"[^>]*>quoted gt<\/a>/.test(gt),
    "quoted '>' must not break tag parsing",
  );
  // Out-of-range / negative ordinals return null, not a throw.
  assert(locateEditable("<h1>x</h1>", 5) === null, "OOB ordinal must be null");
  assert(locateEditable("<h1>x</h1>", -1) === null, "negative ordinal must be null");
}

// 7. Route wiring: edit markers are serve/preview-time ONLY, never exported ----
{
  const read = (p) => readFileSync(path.join(webRoot, p), "utf8");
  const serve = read("app/serve/route.ts");
  const render = read("app/api/projects/render/route.ts");
  const exportRoute = read("app/api/projects/export/route.ts");
  const editRoute = read("app/api/projects/inline-edit/route.ts");

  assert(
    serve.includes("annotateEditableText") &&
      serve.includes("injectInlineEditRuntime") &&
      serve.includes("editMode"),
    "serve route must annotate + inject the runtime in edit mode",
  );
  assert(
    render.includes("annotateEditableText") &&
      render.includes("injectInlineEditRuntime"),
    "render route (srcDoc fallback) must annotate + inject the runtime",
  );
  assert(
    !exportRoute.includes("annotateEditableText") &&
      !exportRoute.includes("injectInlineEditRuntime") &&
      !exportRoute.includes("data-afedit"),
    "export route must NEVER reference inline-edit — markers would leak into the ZIP",
  );
  assert(
    editRoute.includes("locateEditable") &&
      editRoute.includes("normalizeForCompare") &&
      editRoute.includes("escapeEditableText"),
    "inline-edit route must verify (locate + normalize) before splicing (escape)",
  );
}

if (errors.length) {
  console.error("check:inline-edit FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("check:inline-edit OK — walker annotates leaves, round-trips, fails open.");
