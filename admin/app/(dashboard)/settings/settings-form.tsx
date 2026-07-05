"use client";

import { useActionState } from "react";
import { saveSettings, type SaveState } from "./actions";
import { SETTING_SCHEMA } from "./fields";
import { useMessages } from "@/lib/i18n/provider";

const initialState: SaveState = {};

const inputClass =
  "w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/15";

export function SettingsForm({
  values,
}: {
  values: Record<string, string>;
}) {
  const msgs = useMessages();
  const s = msgs.settings;
  const [state, formAction, pending] = useActionState(
    saveSettings,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-8">
      {SETTING_SCHEMA.map((group) => {
        const g = s.groups[group.id];
        return (
          <fieldset
            key={group.id}
            className="space-y-4 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <legend className="px-1 text-sm font-semibold">{g.title}</legend>

            {g.description && (
              <p className="text-xs text-foreground/50">{g.description}</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {group.fields.map((field) => {
                const text = s.fields[field.key as keyof typeof s.fields];
                const optionLabels =
                  field.type === "select"
                    ? s.options[field.key as keyof typeof s.options]
                    : undefined;

                return (
                  <div key={field.key} className="space-y-1.5">
                    <label htmlFor={field.key} className="text-sm font-medium">
                      {text.label}
                    </label>

                    {field.type === "select" && field.optionValues ? (
                      <select
                        id={field.key}
                        name={field.key}
                        defaultValue={values[field.key] ?? ""}
                        className={inputClass}
                      >
                        {field.optionValues.map((val, i) => (
                          <option key={val} value={val}>
                            {optionLabels?.[i] ?? val}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={field.key}
                        name={field.key}
                        type="text"
                        inputMode={
                          field.type === "number" ? "decimal" : undefined
                        }
                        defaultValue={values[field.key] ?? ""}
                        placeholder={
                          field.placeholder
                            ? `${s.placeholderStandardPrefix}${field.placeholder}`
                            : s.placeholderEnvDefault
                        }
                        className={inputClass}
                      />
                    )}

                    {text.help && (
                      <p className="text-xs text-foreground/50">{text.help}</p>
                    )}
                    <p className="font-mono text-[11px] text-foreground/35">
                      {field.key}
                    </p>
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}

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
