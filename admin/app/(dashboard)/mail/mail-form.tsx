"use client";

import { useActionState } from "react";
import { saveMailTemplates, type SaveState } from "./actions";
import type { MailTemplate } from "@/lib/queries";
import { useLocale, useMessages } from "@/lib/i18n/provider";

const initialState: SaveState = {};

// The {{tokens}} each template understands, surfaced as a hint under the body.
// Language-neutral, so not translated.
const PLACEHOLDERS: Record<string, string> = {
  welcome: "{{name}}, {{appUrl}}",
  reset: "{{resetUrl}}, {{expiresHours}}",
};

export function MailForm({
  welcome,
  reset,
}: {
  welcome: MailTemplate;
  reset: MailTemplate;
}) {
  const msgs = useMessages();
  const m = msgs.mail;
  const locale = useLocale();
  const intlLocale = locale === "de" ? "de-DE" : "en-US";
  const labels: Record<string, string> = {
    welcome: m.welcomeLabel,
    reset: m.resetLabel,
  };
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
            {labels[tpl.key]}
          </legend>

          <div className="space-y-1.5">
            <label
              htmlFor={`${tpl.key}_subject`}
              className="text-sm font-medium"
            >
              {m.subject}
            </label>
            <input
              id={`${tpl.key}_subject`}
              name={`${tpl.key}_subject`}
              type="text"
              defaultValue={tpl.subject}
              placeholder={m.subjectPlaceholder}
              className="w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/15"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${tpl.key}_html`} className="text-sm font-medium">
              {m.html}
            </label>
            <textarea
              id={`${tpl.key}_html`}
              name={`${tpl.key}_html`}
              defaultValue={tpl.html}
              rows={12}
              placeholder={m.htmlPlaceholder}
              className="w-full rounded-lg border border-black/10 bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-foreground/40 dark:border-white/15"
            />
            <p className="text-xs text-foreground/50">
              {m.placeholdersLabel} {PLACEHOLDERS[tpl.key]}
              {tpl.updatedAt && (
                <span className="ml-2">
                  · {m.lastChanged} {tpl.updatedAt.toLocaleString(intlLocale)}
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
          {pending ? msgs.common.saving : msgs.common.save}
        </button>
        {state.ok && (
          <span className="text-sm text-green-600 dark:text-green-400">
            {msgs.common.saved}
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
