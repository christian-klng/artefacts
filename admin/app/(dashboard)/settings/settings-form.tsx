"use client";

import { useActionState } from "react";
import { saveSettings, type SaveState } from "./actions";
import { SETTING_GROUPS, type SettingField } from "./fields";

const initialState: SaveState = {};

const inputClass =
  "w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/15";

function Field({
  field,
  value,
}: {
  field: SettingField;
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={field.key} className="text-sm font-medium">
        {field.label}
      </label>

      {field.type === "select" ? (
        <select
          id={field.key}
          name={field.key}
          defaultValue={value}
          className={inputClass}
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={field.key}
          name={field.key}
          type="text"
          inputMode={field.type === "number" ? "decimal" : undefined}
          defaultValue={value}
          placeholder={
            field.placeholder ? `Standard: ${field.placeholder}` : "Leer = ENV/Standard"
          }
          className={inputClass}
        />
      )}

      {field.help && (
        <p className="text-xs text-foreground/50">{field.help}</p>
      )}
      <p className="font-mono text-[11px] text-foreground/35">{field.key}</p>
    </div>
  );
}

export function SettingsForm({
  values,
}: {
  values: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(
    saveSettings,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-8">
      {SETTING_GROUPS.map((group) => (
        <fieldset
          key={group.title}
          className="space-y-4 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <legend className="px-1 text-sm font-semibold">{group.title}</legend>

          {group.description && (
            <p className="text-xs text-foreground/50">{group.description}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => (
              <Field
                key={field.key}
                field={field}
                value={values[field.key] ?? ""}
              />
            ))}
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
