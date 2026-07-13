"use client";

import { useEffect, useMemo, useState } from "react";
import { Palette, X } from "lucide-react";
import {
  parseInterviewState,
  resolvedAnswers,
  type InterviewSpec,
  type InterviewSpecV1,
  type InterviewSubmission,
  type StyleDirection,
} from "@/lib/interview";
import fontCatalog from "@/lib/agent/font-catalog.json";
import { useMessages } from "@/lib/i18n/provider";

/**
 * The first-prompt concept interview. Split in two so the big interactive part
 * (3 questions + 3 style tiles) lives in a roomy MODAL — not inline in the chat,
 * where auto-scroll landed the user at the bottom of a tall card and cut off its
 * start. `InterviewCard` is only the compact chat footprint: a "view
 * suggestions" chip while pending, a Q→A summary once answered, a short note
 * when skipped. `InterviewModal` (opened by the chip / auto-opened on arrival)
 * carries the actual choosing. Legacy v1 rows (palette interviews) keep working.
 */
export function InterviewCard({
  content,
  onOpen,
}: {
  /** The message's JSON InterviewState content (persist-shaped). */
  content: string;
  /** Open the interactive modal (only relevant while pending). */
  onOpen: () => void;
}) {
  const t = useMessages().interview;
  const state = useMemo(() => parseInterviewState(content), [content]);

  if (!state) {
    // Malformed row (shouldn't happen) — never break the chat over it.
    return <p className="pl-1 text-xs text-neutral-500">{t.parseError}</p>;
  }

  if (state.status === "skipped") {
    return <p className="pl-1 text-xs text-neutral-500">{t.skipped}</p>;
  }

  if (state.status === "answered") {
    const resolved = resolvedAnswers(state);
    if (!resolved) return null;
    return (
      <div className="max-w-[95%] space-y-1.5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {t.conceptLabel}
        </p>
        {resolved.pairs.map((p) => (
          <p key={p.question} className="text-neutral-700 dark:text-neutral-300">
            <span className="text-neutral-400 dark:text-neutral-500">
              {p.question}
            </span>{" "}
            {p.answer}
          </p>
        ))}
        {resolved.palette && (
          <div className="flex items-center gap-2 pt-1">
            <ColorSwatches colors={resolved.palette.colors} className="h-4 w-24" />
            <span className="text-xs text-neutral-500">
              {resolved.palette.name}
            </span>
          </div>
        )}
        {resolved.style && (
          <div className="flex items-center gap-2 pt-1">
            <ColorSwatches colors={resolved.style.palette} className="h-4 w-24" />
            <span className="text-xs text-neutral-500">
              {resolved.style.name} — {resolved.style.vibe}
            </span>
          </div>
        )}
      </div>
    );
  }

  // pending — a compact chip; the choosing happens in the modal.
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-900 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white"
    >
      <Palette className="h-4 w-4 shrink-0" aria-hidden />
      {t.openCard}
    </button>
  );
}

/**
 * The interactive interview, shown in a centered modal with room to breathe.
 * Renders nothing unless the row is still pending. Picking a style tile (after
 * all questions are answered) only SELECTS it — the user can read the
 * direction in peace; the explicit "Create app" button (or skipping) CONFIRMS
 * the interview, starts the build, and closes the modal.
 */
export function InterviewModal({
  messageId,
  content,
  streaming,
  onSubmit,
  onClose,
}: {
  messageId: string;
  content: string;
  streaming: boolean;
  onSubmit: (messageId: string, submission: InterviewSubmission) => void;
  onClose: () => void;
}) {
  const t = useMessages().interview;
  const state = useMemo(() => parseInterviewState(content), [content]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!state || state.status !== "pending") return null;
  const { spec } = state;
  const allAnswered = spec.questions.every((q) => selections[q.id]);
  const locked = streaming || submitted;

  function confirm(submission: InterviewSubmission) {
    setSubmitted(true);
    onSubmit(messageId, submission);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t.modalTitle}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 text-sm">
          <p className="text-neutral-700 dark:text-neutral-300">{spec.intro}</p>

          {spec.questions.map((q) => (
            <div key={q.id} className="space-y-2">
              <p className="font-medium">{q.question}</p>
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((o) => {
                  const selected = selections[q.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={locked}
                      aria-pressed={selected}
                      onClick={() =>
                        setSelections((prev) => ({ ...prev, [q.id]: o.id }))
                      }
                      className={`rounded-full border px-3 py-1 text-sm transition disabled:opacity-50 ${
                        selected
                          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                          : "border-neutral-300 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {state.v === 1 ? (
            <PaletteChoice
              spec={state.spec}
              allAnswered={allAnswered}
              locked={locked}
              onPick={(paletteId) => confirm({ selections, paletteId })}
            />
          ) : (
            <StyleChoice
              spec={state.spec}
              allAnswered={allAnswered}
              locked={locked}
              onPick={(styleId) => confirm({ selections, styleId })}
            />
          )}

          <button
            type="button"
            disabled={locked}
            onClick={() => confirm({ skip: true })}
            className="text-xs text-neutral-400 underline-offset-2 transition hover:text-neutral-900 hover:underline disabled:opacity-50 dark:hover:text-white"
          >
            {t.skipAndBuild}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- v1 (legacy): palette grid --------------------------------------------------

function PaletteChoice({
  spec,
  allAnswered,
  locked,
  onPick,
}: {
  spec: InterviewSpecV1;
  allAnswered: boolean;
  locked: boolean;
  onPick: (paletteId: string) => void;
}) {
  const t = useMessages().interview;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p className="font-medium">{spec.paletteQuestion}</p>
      <p className="text-xs text-neutral-500">
        {allAnswered ? t.paletteConfirmHint : t.paletteAnswerFirst}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {spec.palettes.map((p) => {
          const selected = selectedId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={locked || !allAnswered}
              aria-pressed={selected}
              onClick={() => setSelectedId(p.id)}
              className={`rounded-xl border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:ring-white"
                  : "border-neutral-300 enabled:hover:border-neutral-900 dark:border-neutral-700 dark:enabled:hover:border-white"
              }`}
            >
              <ColorSwatches colors={p.colors} className="h-8" />
              <span className="mt-1.5 block truncate text-xs text-neutral-600 dark:text-neutral-400">
                {p.name}
              </span>
            </button>
          );
        })}
      </div>
      <CreateAppButton
        visible={selectedId !== null}
        disabled={locked}
        onClick={() => selectedId && onPick(selectedId)}
      />
    </div>
  );
}

// --- v2: style-direction tiles ---------------------------------------------------

type CatalogFont = {
  id: string;
  family: string;
  weights: number[];
  fallback: string;
};

const CATALOG = fontCatalog as CatalogFont[];

function fontMeta(id: string): CatalogFont & { previewWeight: number } {
  const font = CATALOG.find((f) => f.id === id);
  if (!font) {
    return { id, family: "", weights: [], fallback: "serif", previewWeight: 700 };
  }
  // Heaviest cut up to 700 reads best at specimen size (some display faces
  // ship only 400).
  const previewWeight =
    [...font.weights].filter((w) => w <= 700).pop() ?? font.weights[0] ?? 400;
  return { ...font, previewWeight };
}

function StyleChoice({
  spec,
  allAnswered,
  locked,
  onPick,
}: {
  spec: InterviewSpec;
  allAnswered: boolean;
  locked: boolean;
  onPick: (styleId: string) => void;
}) {
  const t = useMessages().interview;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Real specimens: one @font-face per distinct heading font, served by the
  // public catalog route. ~15 KB each, cached immutable; the catalog fallback
  // stack shows until (or if never) loaded.
  const faces = useMemo(() => {
    const ids = [...new Set(spec.styles.map((s) => s.headingFontId))];
    return ids
      .map((id) => {
        const meta = fontMeta(id);
        if (!meta.family) return "";
        return (
          `@font-face { font-family: '${meta.family}'; ` +
          `src: url('/api/fonts/${meta.id}/${meta.previewWeight}.woff2') format('woff2'); ` +
          `font-weight: ${meta.previewWeight}; font-style: normal; font-display: swap; }`
        );
      })
      .filter(Boolean)
      .join("\n");
  }, [spec.styles]);

  return (
    <div className="space-y-2">
      {faces && <style>{faces}</style>}
      <p className="font-medium">{spec.styleQuestion}</p>
      <p className="text-xs text-neutral-500">
        {allAnswered ? t.styleConfirmHint : t.styleAnswerFirst}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {spec.styles.map((s) => (
          <StyleTile
            key={s.id}
            style={s}
            disabled={locked || !allAnswered}
            selected={selectedId === s.id}
            onPick={() => setSelectedId(s.id)}
          />
        ))}
      </div>
      <CreateAppButton
        visible={selectedId !== null}
        disabled={locked}
        onClick={() => selectedId && onPick(selectedId)}
      />
    </div>
  );
}

function StyleTile({
  style,
  disabled,
  selected,
  onPick,
}: {
  style: StyleDirection;
  disabled: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  const heading = fontMeta(style.headingFontId);
  const [bg, surface, primary, accent, text] = style.palette;
  const radius = style.mutations.radius.split(" ")[0] || "0";

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onPick}
      className={`group rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:ring-white"
          : "border-neutral-300 enabled:hover:border-neutral-900 dark:border-neutral-700 dark:enabled:hover:border-white"
      }`}
    >
      {/* Specimen in the direction's own world: its colors, its heading font. */}
      <div
        className="flex h-32 items-center justify-between overflow-hidden rounded-lg px-4"
        style={{ backgroundColor: bg }}
        aria-hidden
      >
        <span
          className="text-6xl leading-none"
          style={{
            color: text,
            fontFamily: heading.family
              ? `'${heading.family}', ${heading.fallback}`
              : "serif",
            fontWeight: heading.previewWeight,
          }}
        >
          Ag
        </span>
        <span className="flex flex-col items-end gap-1.5">
          {/* Shape demo: the sampled radius on this world's primary color. */}
          <span
            className="block h-8 w-16"
            style={{ backgroundColor: primary, borderRadius: radius }}
          />
          <span
            className="block h-3 w-10"
            style={{ backgroundColor: accent, borderRadius: radius }}
          />
        </span>
      </div>
      <span className="mt-2.5 block text-sm font-medium leading-snug text-neutral-800 dark:text-neutral-200">
        {style.name}
      </span>
      <span className="mt-1 block text-xs leading-snug text-neutral-500">
        {style.vibe}
      </span>
      <ColorSwatches
        colors={[bg, surface, primary, accent, text]}
        className="mt-2.5 h-4"
      />
    </button>
  );
}

/**
 * The explicit confirm step shared by both choice variants: appears once a
 * tile is selected, so the user can read the direction before committing.
 */
function CreateAppButton({
  visible,
  disabled,
  onClick,
}: {
  visible: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useMessages().interview;
  if (!visible) return null;
  return (
    <div className="pt-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 sm:w-auto"
      >
        {t.createApp}
      </button>
    </div>
  );
}

/** A color list as one rounded swatch strip. */
function ColorSwatches({
  colors,
  className,
}: {
  colors: string[];
  className?: string;
}) {
  return (
    <span className={`flex overflow-hidden rounded-md ${className ?? ""}`}>
      {colors.map((color, i) => (
        <span
          key={`${color}-${i}`}
          className="flex-1"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ))}
    </span>
  );
}
