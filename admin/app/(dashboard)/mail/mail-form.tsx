"use client";

import { useActionState } from "react";
import { saveMailTemplates, type SaveState } from "./actions";
import type { MailTemplate } from "@/lib/queries";

const initialState: SaveState = {};

// The {{tokens}} each template understands, surfaced as a hint under the body.
const PLACEHOLDERS: Record<string, string> = {
  welcome: "{{name}}, {{appUrl}}",
  reset: "{{resetUrl}}, {{expiresHours}}",
};

const LABELS: Record<string, string> = {
  welcome: "Begrüßungs-Mail",
  reset: "Passwort zurücksetzen",
};

export function MailForm({
  welcome,
  reset,
}: {
  welcome: MailTemplate;
  reset: MailTemplate;
}) {
  const [state, formAction, pending] = useActionState(
    saveMailTemplates,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-8">
      {[welcome, reset].map((tpl) => (
        <fieldset
          key={tpl.key}
          className="space-y-4 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <legend className="px-1 text-sm font-semibold">
            {LABELS[tpl.key]}
          </legend>

          <div className="space-y-1.5">
            <label
              htmlFor={`${tpl.key}_subject`}
              className="text-sm font-medium"
            >
              Betreff
            </label>
            <input
              id={`${tpl.key}_subject`}
              name={`${tpl.key}_subject`}
              type="text"
              defaultValue={tpl.subject}
              placeholder="Leer = Standardbetreff"
              className="w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/15"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${tpl.key}_html`} className="text-sm font-medium">
              HTML
            </label>
            <textarea
              id={`${tpl.key}_html`}
              name={`${tpl.key}_html`}
              defaultValue={tpl.html}
              rows={12}
              placeholder="Leer = eingebaute Standardvorlage"
              className="w-full rounded-lg border border-black/10 bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-foreground/40 dark:border-white/15"
            />
            <p className="text-xs text-foreground/50">
              Platzhalter: {PLACEHOLDERS[tpl.key]}
              {tpl.updatedAt && (
                <span className="ml-2">
                  · zuletzt geändert{" "}
                  {tpl.updatedAt.toLocaleString("de-DE")}
                </span>
              )}
            </p>
          </div>
        </fieldset>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Speichern"}
        </button>
        {state.ok && (
          <span className="text-sm text-green-600 dark:text-green-400">
            Gespeichert.
          </span>
        )}
        {state.error && (
          <span className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
