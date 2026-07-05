// Language-neutral structure of the editable operational settings, grouped for
// the admin form. Each `key` mirrors the matching env var name; the builder reads
// it via web/lib/settings.ts with precedence DB > env > default. `placeholder`
// shows the built-in default (numbers, URLs, model ids — not translated). All
// human-readable text (group titles/descriptions, field labels/help, option
// labels) lives in the i18n dictionaries under `settings.*`, keyed by group id /
// field key. Only NON-secret values are here — CORTECS_API_KEY and SMTP_PASS stay
// in the server environment.

export type SettingType = "text" | "number" | "select";

export type SettingSchemaField = {
  key: string;
  type?: SettingType;
  placeholder?: string;
  /** For selects: the option VALUES; labels come from i18n (`settings.options`) by index. */
  optionValues?: string[];
};

export type SettingGroupId =
  | "cortecs"
  | "billing"
  | "referral"
  | "backups"
  | "smtp";

export type SettingSchemaGroup = {
  id: SettingGroupId;
  fields: SettingSchemaField[];
};

export const SETTING_SCHEMA: SettingSchemaGroup[] = [
  {
    id: "cortecs",
    fields: [
      { key: "CORTECS_BUILD_MODEL", placeholder: "claude-opus4-8" },
      { key: "CORTECS_CLEANUP_MODEL", placeholder: "claude-haiku-4-5" },
      { key: "CORTECS_INTERVIEW_MODEL", placeholder: "claude-4-6-sonnet" },
      { key: "CORTECS_SOVEREIGN_BUILD_MODEL", placeholder: "claude-opus4-8" },
      { key: "CORTECS_ANTHROPIC_BASE_URL", placeholder: "https://api.cortecs.ai" },
      { key: "CORTECS_OPENAI_BASE_URL", placeholder: "https://api.cortecs.ai/v1" },
      { key: "CORTECS_PRICE_TTL_MS", placeholder: "3600000", type: "number" },
    ],
  },
  {
    id: "billing",
    fields: [
      { key: "BILLING_MARGIN", placeholder: "1.20", type: "number" },
      { key: "FREE_TIER_GRANT_EUR", placeholder: "2.00", type: "number" },
      { key: "CORTECS_FEE_MULTIPLIER", placeholder: "1.0", type: "number" },
      { key: "CACHE_READ_PRICE_RATIO", placeholder: "0.1", type: "number" },
      { key: "CACHE_WRITE_PRICE_RATIO", placeholder: "1.25", type: "number" },
    ],
  },
  {
    id: "referral",
    fields: [
      { key: "REFERRAL_RECIPIENT_EUR", placeholder: "10.00", type: "number" },
      { key: "REFERRAL_REFERRER_EUR", placeholder: "5.00", type: "number" },
      { key: "REFERRAL_WINDOW_DAYS", placeholder: "14", type: "number" },
    ],
  },
  {
    id: "backups",
    fields: [
      {
        key: "BACKUP_ENABLED",
        type: "select",
        optionValues: ["", "true", "false"],
      },
      { key: "BACKUP_RETENTION_DAYS", placeholder: "7", type: "number" },
    ],
  },
  {
    id: "smtp",
    fields: [
      { key: "SMTP_HOST", placeholder: "smtp.ionos.de" },
      { key: "SMTP_PORT", placeholder: "587", type: "number" },
      { key: "SMTP_USER", placeholder: "mail@kubikraum.digital" },
      {
        key: "SMTP_SECURE",
        type: "select",
        optionValues: ["", "true", "false"],
      },
      { key: "MAIL_FROM", placeholder: "Kubikraum <mail@kubikraum.digital>" },
    ],
  },
];

/** Flat list of every editable key, used by the save action. */
export const SETTING_KEYS: string[] = SETTING_SCHEMA.flatMap((g) =>
  g.fields.map((f) => f.key),
);
