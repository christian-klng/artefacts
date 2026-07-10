import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";

// Highlighting the exact spot a build turn just changed, in the read-only code
// view: when the agent edits one place, we scroll there and flash the new code
// yellow for ~1s. The heavy lifting is `diffToRange` (which region changed) plus
// a tiny CodeMirror decoration; the wiring lives in components/sandpack-
// workspace.tsx. See also the file-tree row animations (globals.css).

/** A [from, to) character range in a file's NEW content. */
export type EditRange = { from: number; to: number };

/** A pending flash for a specific file. `nonce` re-triggers repeated edits. */
export type EditHighlight = EditRange & { path: string; nonce: number };

/**
 * Locates the region a targeted edit changed by trimming the common prefix and
 * suffix of the previous vs. new content, returning its [from, to) range in
 * `next`. Returns null when there's nothing worth flashing:
 *  - brand-new or unchanged file (no single "spot" to point at),
 *  - a pure deletion (nothing new to mark),
 *  - a wholesale rewrite (unchanged context too small — flashing the whole file
 *    is just noise), or
 *  - an insert so large it would flood the viewport.
 * Deliberately tool-agnostic: a small write_file rewrite reads as a local edit
 * just like edit_file does, so we don't need to know which tool ran.
 */
export function diffToRange(prev: string, next: string): EditRange | null {
  if (!prev || prev === next) return null;
  const n = next.length;
  const p = prev.length;
  const min = Math.min(n, p);
  let a = 0;
  while (a < min && prev.charCodeAt(a) === next.charCodeAt(a)) a++;
  let b = 0;
  while (
    b < min - a &&
    prev.charCodeAt(p - 1 - b) === next.charCodeAt(n - 1 - b)
  )
    b++;
  const from = a;
  const to = n - b;
  const changed = to - from;
  if (changed <= 0) return null; // deletion only — nothing new to mark
  if (changed > 4000) return null; // too big to be "a spot"
  if (a + b < n * 0.15) return null; // wholesale rewrite, not a targeted edit
  return { from, to };
}

// --- CodeMirror flash decoration -------------------------------------------

/** How long the yellow band stays before it's cleared (matches the CSS fade). */
export const FLASH_MS = 1000;

const setFlash = StateEffect.define<EditRange | null>();
const flashMark = Decoration.mark({ class: "cm-edit-flash" });

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setFlash)) {
        deco = e.value
          ? Decoration.set([flashMark.range(e.value.from, e.value.to)])
          : Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Pass this to SandpackCodeEditor's `extensions` prop. */
export const flashExtension = [flashField];

/**
 * Scrolls `range` into view (centered) and flashes it yellow, clearing after
 * FLASH_MS. Safe against a torn-down view (file switched / unmounted). Returns a
 * cancel fn for the pending clear timer, so callers can supersede it.
 */
export function flashEditRange(view: EditorView, range: EditRange): () => void {
  const len = view.state.doc.length;
  const from = Math.max(0, Math.min(range.from, len));
  const to = Math.max(from, Math.min(range.to, len));
  const effects: StateEffect<unknown>[] = [
    EditorView.scrollIntoView(from, { y: "center" }),
  ];
  if (to > from) effects.push(setFlash.of({ from, to }));
  view.dispatch({ effects });
  if (to === from) return () => {};
  const timer = setTimeout(() => {
    try {
      view.dispatch({ effects: setFlash.of(null) });
    } catch {
      // view torn down — nothing to clear
    }
  }, FLASH_MS);
  return () => clearTimeout(timer);
}
