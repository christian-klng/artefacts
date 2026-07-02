import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  boolean,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ---------------------------------------------------------------------------
// Auth.js tables (compatible with @auth/drizzle-adapter defaults).
// We use JWT sessions + a Credentials provider, but keep the full set of
// tables so OAuth providers / the database adapter can be added later without
// a migration churn.
// ---------------------------------------------------------------------------

export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Credentials provider: bcrypt hash. Null for OAuth-only users.
  passwordHash: text("passwordHash"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// Password reset tokens. We store only the SHA-256 hash of the token — the raw
// token lives solely in the emailed link, so a DB leak can't be used to reset
// passwords. Tokens are single-use (usedAt) and expire (expires).
export const passwordResetTokens = pgTable(
  "password_reset_token",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("tokenHash").notNull().unique(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
    usedAt: timestamp("usedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Application tables: per-user projects, their virtual filesystem, chat
// history, and published artifact versions.
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "project",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Untitled project"),
    // The Sandpack template this project bundles with (e.g. "react", "vanilla").
    template: text("template").notNull().default("react"),
    // --- Publishing (Way 3 Phase 4) ---
    // When published, the app is served publicly and un-gated at
    // <publishSlug>.apps.<APPS_DOMAIN> (vs. the token-gated preview-<id> host).
    published: boolean("published").notNull().default(false),
    // Public address label, unique across all projects (enforced by the unique
    // INDEX below — NOT a column .unique() constraint, because drizzle-kit push
    // prompts to truncate when adding a unique CONSTRAINT to a populated table,
    // which hangs the non-TTY migrate container). Kept on unpublish so
    // re-publishing reuses the same URL.
    publishSlug: text("publish_slug"),
    // The frozen artifact_version served publicly. Plain id (no FK) to avoid a
    // circular projects<->artifact_version constraint; versions are only ever
    // removed by project cascade, so it can't dangle in practice.
    publishedVersionId: uuid("published_version_id"),
    // The public URL the user intends to deploy the EXPORT under. Used only to
    // substitute the __SITE_URL__ placeholder in exported SEO files (canonical/
    // og/sitemap). Publishing doesn't need it — the serve route knows its own
    // host. Nullable; pre-fills the export modal once set.
    siteUrl: text("site_url"),
    // --- Per-project database (Way 3 Phase 2/3) ---
    // Whether this app has an isolated Postgres schema + role provisioned. The
    // agent flips it on the first apply_schema once the user opts in. Drives the
    // workspace "Datenbank" badge and gates the data/auth API + export dump.
    databaseEnabled: boolean("database_enabled").notNull().default(false),
    // When the schema/role were actually created (null = never). Provisioning is
    // idempotent; this is just an audit timestamp.
    dbProvisionedAt: timestamp("db_provisioned_at", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (project) => [
    index("project_user_idx").on(project.userId),
    uniqueIndex("project_publish_slug_unique").on(project.publishSlug),
  ],
);

// One row per file in a project's virtual filesystem. The agent's file tools
// (read/write/edit/delete) operate exclusively on these rows — never the host
// disk — which is what keeps multi-tenant isolation at the data layer.
export const files = pgTable(
  "file",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Absolute virtual path, e.g. "/src/App.tsx".
    path: text("path").notNull(),
    // For text files (encoding "utf8") this is the raw text; for binary files
    // (encoding "base64", e.g. an embedded image/PDF) this is the base64 payload.
    content: text("content").notNull().default(""),
    // "utf8" | "base64". Binary assets carry their original mimeType.
    encoding: text("encoding").notNull().default("utf8"),
    mimeType: text("mimeType"),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (file) => [uniqueIndex("file_project_path_idx").on(file.projectId, file.path)],
);

export const messages = pgTable(
  "message",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // "user" | "assistant" | "system" | "tool"
    role: text("role").notNull(),
    content: text("content").notNull(),
    // For "tool" rows: the agent tool name (e.g. "write_file"), used by the
    // client to pick an icon. Null for user/assistant/system messages.
    tool: text("tool"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (message) => [index("message_project_idx").on(message.projectId)],
);

// User-uploaded reference files (design concepts, texts, foreign HTML/CSS, …).
// Deliberately separate from the `file` VFS: these are read-only *context* for
// the agent, NOT part of the app's files — so they never appear in the Sandpack
// code tree, downloads, or artifact versions. The agent reaches them lazily via
// dedicated MCP tools (list_attachments / read_attachment). Scoped by projectId
// like everything else.
export const attachments = pgTable(
  "attachment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mimeType").notNull(),
    // "text" | "image" — drives whether the agent reads extracted text or gets
    // an image content block (vision).
    kind: text("kind").notNull(),
    // Size of the original file in bytes.
    size: integer("size").notNull(),
    // The original file, base64-encoded. Covers both re-download and the image
    // block for vision. Large — never select this in list queries.
    dataBase64: text("dataBase64").notNull(),
    // Extracted plain text for the agent; null for images (vision instead).
    extractedText: text("extractedText"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (a) => [index("attachment_project_idx").on(a.projectId)],
);

// ---------------------------------------------------------------------------
// Billing (Cortecs migration): EUR credit balance + per-request usage ledger.
// All LLM traffic routes through cortecs.ai, which bills in EUR. Cortecs returns
// only token counts per request (no EUR), so we self-compute cost from the
// /v1/models price catalog × tokens and apply our margin. See lib/cortecs/.
// ---------------------------------------------------------------------------

// One row per user holding their spendable EUR credit. The balance is kept as a
// maintained column (not a SUM over the ledger) because the pre-flight budget
// gate reads it on every agent turn — a single indexed row read beats summing a
// growing ledger. recordUsageAndDeduct keeps column + ledger consistent in one
// transaction; usageEvent remains the audit source of truth.
//
// Money is numeric(12,6): six decimals because a single request's billed cost is
// often a fraction of a cent. Never float (rounding drift on money).
export const userCredits = pgTable("user_credit", {
  userId: uuid("userId")
    .notNull()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // Spendable balance in EUR (what the user paid, 1:1). Each turn deducts the
  // billed cost (Cortecs cost × margin). May go slightly negative on a final
  // turn whose token use only became known after it ran — the next turn's gate
  // then blocks until top-up.
  balanceEur: numeric("balance_eur", { precision: 12, scale: 6 })
    .notNull()
    .default("0"),
  // The one-time free grant given on first use (for "has the free tier already
  // been granted?" idempotency and reporting). freeGrantedAt null => not granted.
  freeGrantedEur: numeric("free_granted_eur", { precision: 12, scale: 6 })
    .notNull()
    .default("0"),
  freeGrantedAt: timestamp("free_granted_at", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

// Append-only ledger: one row per billed LLM request (agent turn or cleanup
// task). The audit/reconciliation source of truth behind userCredits.balanceEur.
export const usageEvents = pgTable(
  "usage_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Nullable + set null: keep the ledger for billing history even if the
    // project is later deleted.
    projectId: uuid("projectId").references(() => projects.id, {
      onDelete: "set null",
    }),
    // "build" | "cleanup" | "sovereign_build" (lib/cortecs/config.ts TaskKind).
    task: text("task").notNull(),
    model: text("model").notNull(),
    // Cortecs provider that served the request (providers[0] from /v1/models).
    provider: text("provider"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
    // Our computed Cortecs cost (incl. their fee), the billed amount (cost ×
    // margin) deducted from the balance, and the margin we earned.
    cortecsCostEur: numeric("cortecs_cost_eur", {
      precision: 12,
      scale: 6,
    }).notNull(),
    billedEur: numeric("billed_eur", { precision: 12, scale: 6 }).notNull(),
    marginEur: numeric("margin_eur", { precision: 12, scale: 6 }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (e) => [
    index("usage_event_user_idx").on(e.userId),
    index("usage_event_project_idx").on(e.projectId),
  ],
);

// Editable transactional email templates (welcome, password reset). Moved out
// of env vars because Coolify's environment_variables.value is varchar(256) and
// the HTML bodies blow past it. Edited in the admin app; the builder reads them
// here and falls back to the built-in defaults in lib/mail-templates.ts when a
// row is missing or its body is blank. key = "welcome" | "reset".
export const mailTemplates = pgTable("mail_template", {
  key: text("key").primaryKey(),
  subject: text("subject").notNull().default(""),
  html: text("html").notNull().default(""),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

// Editable operational settings — the Cortecs LLM router (models, base URLs),
// the billing constants, and the SMTP mail config. Surfaced in the admin app so
// e.g. the build model or margin can change WITHOUT a redeploy. `key` mirrors the
// matching env var name; the builder reads via lib/settings.ts with precedence
// DB value > process.env[key] > code default (lib/settings.ts). Only NON-secret
// values live here — CORTECS_API_KEY / SMTP_PASS stay in env only.
export const appSettings = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

// A snapshot of the project at publish time, so versions can be restored — the
// equivalent of Claude artifacts' version history.
export const artifactVersions = pgTable(
  "artifact_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text("label"),
    // JSON map of { path: content } captured at publish time.
    snapshot: text("snapshot").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (version) => [index("artifact_version_project_idx").on(version.projectId)],
);

// ---------------------------------------------------------------------------
// End-user accounts for GENERATED apps (Way 3 Phase 3). These are NOT builder
// users — they are the people who sign up inside a published/preview app (the
// "login" the agent wires up). Credentials live here in the builder DB, never
// in the tenant schema, so the low-privilege project role can't read password
// hashes. `appUser.id` is the value pushed into the `app.end_user_id` GUC, so
// it is the `owner_id` that per-user RLS isolates rows by. Scoped by projectId;
// an email is unique only WITHIN a project (the same person can hold an account
// in two different generated apps).
// ---------------------------------------------------------------------------
export const appUsers = pgTable(
  "app_user",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    // bcrypt hash — same hashing the builder uses for its own users.
    passwordHash: text("passwordHash").notNull(),
    // Optional display name the app may collect at signup.
    name: text("name"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  // uniqueIndex (NOT .unique()) so drizzle-kit push never hits the populated-
  // table truncate prompt that hangs the non-TTY migrate container.
  (u) => [uniqueIndex("app_user_project_email_idx").on(u.projectId, u.email)],
);
