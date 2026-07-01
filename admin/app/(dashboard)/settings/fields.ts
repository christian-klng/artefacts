// The editable operational settings, grouped for the admin form. Each `key`
// mirrors the matching env var name; the builder reads it via web/lib/settings.ts
// with precedence DB > env > default. `placeholder` shows the built-in default so
// the admin knows what a blank field falls back to. Only NON-secret values are
// here — CORTECS_API_KEY and SMTP_PASS stay in the server environment.

export type SettingField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  help?: string;
};

export type SettingGroup = {
  title: string;
  description?: string;
  fields: SettingField[];
};

export const SETTING_GROUPS: SettingGroup[] = [
  {
    title: "Cortecs (LLM-Router)",
    description:
      "Modelle & Endpunkte. WICHTIG: cortecs.ai nutzt eigene Katalog-IDs, die von Anthropics Schreibweise abweichen — Opus 4.8 heißt hier claude-opus4-8 (ohne Bindestrich nach dem Wort opus), NICHT claude-opus-4-8. Verfügbare IDs: https://api.cortecs.ai/v1/models.",
    fields: [
      {
        key: "CORTECS_BUILD_MODEL",
        label: "Builder-Modell",
        placeholder: "claude-opus4-8",
      },
      {
        key: "CORTECS_CLEANUP_MODEL",
        label: "Cleanup-Modell",
        placeholder: "claude-haiku-4-5",
      },
      {
        key: "CORTECS_SOVEREIGN_BUILD_MODEL",
        label: "Sovereign-Builder-Modell",
        placeholder: "claude-opus4-8",
      },
      {
        key: "CORTECS_ANTHROPIC_BASE_URL",
        label: "Anthropic Base-URL",
        placeholder: "https://api.cortecs.ai",
      },
      {
        key: "CORTECS_OPENAI_BASE_URL",
        label: "OpenAI Base-URL",
        placeholder: "https://api.cortecs.ai/v1",
      },
      {
        key: "CORTECS_PRICE_TTL_MS",
        label: "Preis-Cache TTL (ms)",
        placeholder: "3600000",
        type: "number",
      },
    ],
  },
  {
    title: "Billing / Credits",
    fields: [
      {
        key: "BILLING_MARGIN",
        label: "Marge",
        placeholder: "1.20",
        type: "number",
        help: "1.20 = +20 % Aufschlag auf die reinen Cortecs-Kosten.",
      },
      {
        key: "FREE_TIER_GRANT_EUR",
        label: "Gratis-Guthaben (EUR)",
        placeholder: "2.00",
        type: "number",
        help: "Einmalige Gutschrift bei erster Nutzung.",
      },
      {
        key: "CORTECS_FEE_MULTIPLIER",
        label: "Fee-Multiplikator",
        placeholder: "1.0",
        type: "number",
        help: "1.05, falls der Katalogpreis netto (ohne Cortecs' 5 %-Fee) ist.",
      },
    ],
  },
  {
    title: "E-Mail (SMTP)",
    description:
      "Zugangsdaten für den Mailversand. Das Passwort (SMTP_PASS) bleibt aus Sicherheitsgründen in der Server-Umgebung.",
    fields: [
      { key: "SMTP_HOST", label: "Host", placeholder: "smtp.ionos.de" },
      { key: "SMTP_PORT", label: "Port", placeholder: "587", type: "number" },
      {
        key: "SMTP_USER",
        label: "Benutzer",
        placeholder: "mail@kubikraum.digital",
      },
      {
        key: "SMTP_SECURE",
        label: "TLS-Modus",
        type: "select",
        options: [
          { value: "", label: "Standard (587 / STARTTLS)" },
          { value: "true", label: "secure = true (465 / implizit)" },
          { value: "false", label: "secure = false" },
        ],
      },
      {
        key: "MAIL_FROM",
        label: "Absender (From)",
        placeholder: "Kubikraum <mail@kubikraum.digital>",
        help: "Leer = es wird der SMTP-Benutzer als Absender verwendet.",
      },
    ],
  },
];

/** Flat list of every editable key, used by the save action. */
export const SETTING_KEYS: string[] = SETTING_GROUPS.flatMap((g) =>
  g.fields.map((f) => f.key),
);
