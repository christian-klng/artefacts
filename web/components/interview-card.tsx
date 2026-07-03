"use client";

import { useMemo, useState } from "react";
import {
  parseInterviewState,
  resolvedAnswers,
  type InterviewPalette,
  type InterviewSubmission,
} from "@/lib/interview";

/**
 * The first-prompt concept interview card: 3 single-select questions as pill
 * buttons plus the color-scheme question as clickable palettes. Clicking a
 * palette (enabled once all questions are answered) CONFIRMS the interview and
 * starts the build — there is no separate submit button. Once answered or
 * skipped (content flips to that status, optimistically or from the DB) the
 * card renders as a static summary.
 */
export function InterviewCard({
  messageId,
  content,
  streaming,
  onSubmit,
}: {
  messageId: string;
  /** The message's JSON InterviewState content (persist-shaped). */
  content: string;
  streaming: boolean;
  onSubmit: (messageId: string, submission: InterviewSubmission) => void;
}) {
  const state = useMemo(() => parseInterviewState(content), [content]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!state) {
    // Malformed row (shouldn't happen) — never break the chat over it.
    return (
      <p className="pl-1 text-xs text-neutral-500">
        Konzeptfragen konnten nicht angezeigt werden.
      </p>
    );
  }
  const { spec } = state;

  if (state.status === "skipped") {
    return (
      <p className="pl-1 text-xs text-neutral-500">Konzeptfragen übersprungen</p>
    );
  }

  if (state.status === "answered") {
    const resolved = state.answers
      ? resolvedAnswers(spec, state.answers)
      : null;
    if (!resolved) return null;
    return (
      <div className="max-w-[95%] space-y-1.5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Konzept
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
            <PaletteSwatches palette={resolved.palette} className="h-4 w-24" />
            <span className="text-xs text-neutral-500">
              {resolved.palette.name}
            </span>
          </div>
        )}
      </div>
    );
  }

  // pending — interactive
  const allAnswered = spec.questions.every((q) => selections[q.id]);
  const locked = streaming || submitted;

  return (
    <div className="max-w-[95%] space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-neutral-700 dark:text-neutral-300">{spec.intro}</p>

      {spec.questions.map((q) => (
        <div key={q.id} className="space-y-1.5">
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

      <div className="space-y-1.5">
        <p className="font-medium">{spec.paletteQuestion}</p>
        <p className="text-xs text-neutral-500">
          {allAnswered
            ? "Klick auf eine Palette bestätigt deine Auswahl und startet den Bau."
            : "Beantworte zuerst die drei Fragen, dann wähle hier dein Farbschema."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {spec.palettes.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={locked || !allAnswered}
              onClick={() => {
                setSubmitted(true);
                onSubmit(messageId, { selections, paletteId: p.id });
              }}
              className="rounded-xl border border-neutral-300 p-2 text-left transition enabled:hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:enabled:hover:border-white"
            >
              <PaletteSwatches palette={p} className="h-6" />
              <span className="mt-1.5 block truncate text-xs text-neutral-600 dark:text-neutral-400">
                {p.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={locked}
        onClick={() => {
          setSubmitted(true);
          onSubmit(messageId, { skip: true });
        }}
        className="text-xs text-neutral-400 underline-offset-2 transition hover:text-neutral-900 hover:underline disabled:opacity-50 dark:hover:text-white"
      >
        Fragen überspringen und direkt bauen
      </button>
    </div>
  );
}

/** A palette's colors as one rounded swatch strip. */
function PaletteSwatches({
  palette,
  className,
}: {
  palette: InterviewPalette;
  className?: string;
}) {
  return (
    <span className={`flex overflow-hidden rounded-md ${className ?? ""}`}>
      {palette.colors.map((color, i) => (
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
