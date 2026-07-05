"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLocale, useMessages } from "@/lib/i18n/provider";

// Where the prompt is handed off. Baked in at build time (it's public).
const BUILDER_URL =
  process.env.NEXT_PUBLIC_BUILDER_URL ?? "https://app.kubikraum.digital";

const MAX_PROMPT = 1500;

export function PromptBox() {
  const m = useMessages();
  const locale = useLocale();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    const text = value.trim().slice(0, MAX_PROMPT);
    setSubmitting(true);
    // The builder's /start route stashes the prompt in a cookie, then routes the
    // visitor through signup/login and into a fresh, auto-building app. `lang`
    // carries the chosen landing language over so the builder can seed it.
    window.location.href = text
      ? `${BUILDER_URL}/start?prompt=${encodeURIComponent(text)}&lang=${locale}`
      : `${BUILDER_URL}/signup?lang=${locale}`;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-neutral-300 bg-white p-2 shadow-sm focus-within:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus-within:border-white">
        <textarea
          autoFocus
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={m.promptBox.placeholder}
          className="w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-xs text-neutral-500">{m.promptBox.hint}</span>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {submitting ? m.promptBox.submitting : m.promptBox.build}
            {!submitting && <ArrowRight className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {m.promptBox.examples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setValue(ex)}
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-500 transition hover:border-neutral-900 hover:text-neutral-900 dark:border-neutral-700 dark:hover:border-white dark:hover:text-neutral-100"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
