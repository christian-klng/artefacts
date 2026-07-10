import { sql } from "drizzle-orm";
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

export const users = pgTable(
  "user",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
    // Credentials provider: bcrypt hash. Null for OAuth-only users.
    passwordHash: text("passwordHash"),
    // UI language ('de' | 'en'). NULLABLE and NO default on purpose: NULL means
    // "never chosen" → keep auto-detecting (cookie/Accept-Language); a value is an
    // explicit settings choice that then follows the user across devices and is
    // used to localise their transactional emails. Plain nullable text column →
    // safe for drizzle-kit push --force in the non-TTY migrate container.
    locale: text("locale"),
    // Stripe customer id (cus_…), set on the user's first successful checkout.
    // Needed to open the billing portal (cancel/payment method). Nullable; the
    // unique INDEX (not .unique()) allows the many NULLs of not-yet-paying users
    // and is migrate-safe on this populated table.
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (u) => [uniqueIndex("user_stripe_customer_idx").on(u.stripeCustomerId)],
);

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
    // LEGACY: superseded by publishedBackupId below; read only as a fallback for
    // apps published before the full-backup rework (see lib/projects.ts).
    publishedVersionId: uuid("published_version_id"),
    // The frozen project_backup served publicly (full-backup rework). Replaces
    // publishedVersionId; both are kept during the transition so already-
    // published apps keep serving via the legacy pointer. Plain id (no FK) —
    // same rationale as publishedVersionId above.
    publishedBackupId: uuid("published_backup_id"),
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
    // --- "Erstellt mit Kubikraum" attribution badge ---
    // When true, the serve/preview routes skip injecting the badge (see
    // lib/badge.ts). Default false = badge shown on all published apps + previews.
    // Plain default column (no unique) → safe for the non-TTY migrate push.
    // Prepared for a future paid-plan toggle; no UI flips it yet.
    badgeHidden: boolean("badge_hidden").notNull().default(false),
    // --- Hosting subscription (Stripe) ---
    // True while this app has an ACTIVE 5€/month hosting subscription. Set by the
    // Stripe webhook (see lib/stripe/). Denormalised from the `subscription` table
    // for cheap reads; it gates FUTURE premium features (custom domain, more
    // storage/traffic) — nothing in the serve path consumes it yet, because the
    // free <slug>.apps.<APPS_DOMAIN> subdomain always stays online.
    hostingActive: boolean("hosting_active").notNull().default(false),
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
    // Special message kinds. 'interview' = the first-prompt concept interview
    // card; its `content` is a JSON InterviewState (lib/interview.ts). Null for
    // plain chat messages.
    kind: text("kind"),
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

// A full-app backup: the whole project state (VFS files + per-project DB schema
// & data + app_user accounts + attachments + settings) captured as one self-
// contained JSON blob. Replaces artifact_version as the single snapshot/restore
// mechanism (see lib/backup.ts). Created per file-changing agent turn ('auto'),
// on publish ('publish'), and once a day for published apps ('daily'); retained
// ~7 days by lib/backup.ts pruneBackups.
export const projectBackups = pgTable(
  "project_backup",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // 'auto' | 'daily' | 'publish' | 'manual'.
    kind: text("kind").notNull(),
    label: text("label"),
    // Self-contained JSON blob (BackupBlob in lib/backup.ts). Plain text (NOT
    // jsonb) so the files section round-trips byte-identically to the old
    // artifact_version snapshot — publish signatures depend on that.
    data: text("data").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  // Plain indexes only (never .unique()) so the non-TTY migrate push can't hit
  // the populated-table truncate prompt. The second index serves retention +
  // "latest per kind" lookups in lib/backup.ts.
  (b) => [
    index("project_backup_project_idx").on(b.projectId),
    index("project_backup_project_kind_created_idx").on(
      b.projectId,
      b.kind,
      b.createdAt,
    ),
  ],
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

// ---------------------------------------------------------------------------
// Coupons / referral credit (lib/coupons.ts). Two kinds share one table:
//   - "referral": a user activates ONE personal code. Redeeming grants the
//     redeemer `recipient_amount_eur` (default 10€) IMMEDIATELY; the referrer's
//     `referrer_amount_eur` (default 5€) is only RECORDED as pending — it is not
//     paid out until the future Stripe/subscription integration settles it.
//   - "admin": fully configurable codes the admin creates for test users
//     (custom amount, optional referrer/owner, redemption cap, expiry).
// Codes are stored UPPERCASED and compared case-insensitively.
// ---------------------------------------------------------------------------
export const coupons = pgTable(
  "coupon",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    // The referrer, for "referral" coupons; null for admin-created codes.
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // "referral" | "admin"
    kind: text("kind").notNull(),
    // Credit granted to the redeemer, immediately, on redemption.
    recipientAmountEur: numeric("recipient_amount_eur", {
      precision: 12,
      scale: 6,
    }).notNull(),
    // Potential credit to the owner/referrer — only on a qualifying redemption.
    referrerAmountEur: numeric("referrer_amount_eur", {
      precision: 12,
      scale: 6,
    })
      .notNull()
      .default("0"),
    // Referral: the referrer reward requires the redeemer to subscribe within
    // reward_window_days. Admin codes usually set this false.
    referrerRequiresSubscription: boolean("referrer_requires_subscription")
      .notNull()
      .default(true),
    rewardWindowDays: integer("reward_window_days").notNull().default(14),
    // null = unlimited total redemptions.
    maxRedemptions: integer("max_redemptions"),
    // null = never expires.
    expiresAt: timestamp("expires_at", { mode: "date" }),
    active: boolean("active").notNull().default(true),
    createdByAdmin: boolean("created_by_admin").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (c) => [
    uniqueIndex("coupon_code_idx").on(c.code),
    // One referral coupon per user (admin codes have a null owner → not covered
    // by this partial index).
    uniqueIndex("coupon_owner_referral_idx")
      .on(c.ownerId)
      .where(sql`${c.kind} = 'referral'`),
  ],
);

// One row per redemption. The recipient credit is applied in the same
// transaction; the referrer reward is recorded as pending and settled later.
export const couponRedemptions = pgTable(
  "coupon_redemption",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    // The "new" user who redeemed (the Empfänger).
    redeemerId: uuid("redeemer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Snapshot of the coupon kind — drives the "one referral per user" rule.
    couponKind: text("coupon_kind").notNull(),
    // The redeemer's welcome bonus AMOUNT. For admin coupons it's granted at
    // redemption (status 'granted'); for referral coupons it's DEFERRED until the
    // redeemer subscribes (status 'pending' → settled by settleReferralRewards).
    recipientCreditedEur: numeric("recipient_credited_eur", {
      precision: 12,
      scale: 6,
    }).notNull(),
    // "pending" | "granted" | "expired". Default 'granted' so pre-existing rows
    // (all credited immediately) backfill correctly + no truncate prompt on push.
    recipientRewardStatus: text("recipient_reward_status")
      .notNull()
      .default("granted"),
    recipientRewardGrantedAt: timestamp("recipient_reward_granted_at", {
      mode: "date",
    }),
    // Referrer snapshot + the (pending) reward.
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    referrerRewardEur: numeric("referrer_reward_eur", {
      precision: 12,
      scale: 6,
    })
      .notNull()
      .default("0"),
    // "pending" | "granted" | "expired" | "none"
    referrerRewardStatus: text("referrer_reward_status")
      .notNull()
      .default("none"),
    referrerRewardDeadline: timestamp("referrer_reward_deadline", {
      mode: "date",
    }),
    referrerRewardGrantedAt: timestamp("referrer_reward_granted_at", {
      mode: "date",
    }),
    redeemedAt: timestamp("redeemed_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (r) => [
    // A given coupon can be redeemed at most once per user.
    uniqueIndex("coupon_redemption_coupon_user_idx").on(
      r.couponId,
      r.redeemerId,
    ),
    // At most one REFERRAL redemption per user (the welcome bonus is once-ever).
    uniqueIndex("coupon_redemption_referral_user_idx")
      .on(r.redeemerId)
      .where(sql`${r.couponKind} = 'referral'`),
    index("coupon_redemption_owner_idx").on(r.ownerId),
  ],
);

// ---------------------------------------------------------------------------
// Stripe billing (Payment Links): per-app hosting subscriptions + credit top-ups.
// Payment happens on static Stripe Payment Links; the webhook (POST
// /api/stripe/webhook) writes these rows. Secrets (STRIPE_SECRET_KEY /
// STRIPE_WEBHOOK_SECRET) are env-only; the Payment Link URLs are non-secret
// app_settings. All new tables → uniqueIndex (not .unique()), migrate-safe.
// See web/lib/stripe/*.
// ---------------------------------------------------------------------------

// One row per Stripe subscription = one published app's 5€/month hosting plan
// (per-app). An active subscription unlocks that app's future premium features
// AND grants its owner 5€/month of expiring builder credit (see creditGrants).
// The free <slug>.apps.<APPS_DOMAIN> subdomain stays online regardless — there
// is no serving gate.
export const subscriptions = pgTable(
  "subscription",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The hosted app. Nullable + set null: survives project deletion and the
    // "unlinked" case (a shared Payment Link opened without a client_reference_id).
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    // Our idempotency/lookup key. Unique INDEX (not .unique()) → migrate-safe.
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    // Stripe's status: "active" | "past_due" | "canceled" | "incomplete" | "unpaid".
    status: text("status").notNull(),
    priceId: text("price_id"),
    currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (s) => [
    uniqueIndex("subscription_stripe_id_idx").on(s.stripeSubscriptionId),
    index("subscription_user_idx").on(s.userId),
    index("subscription_project_idx").on(s.projectId),
  ],
);

// Expiring monthly builder credit: ONE row per paid subscription invoice. Unlike
// user_credit.balanceEur (persistent: free grant + coupons + top-ups), this
// credit EXPIRES if unused (expiresAt = the invoice's billing-period end) and
// STACKS across subscriptions with different renewal dates. Consumption
// (recordUsageAndDeduct) draws from the soonest-expiring active grant first, the
// persistent balance last. Expiry is LAZY — queries filter expiresAt > now();
// unused credit simply stops counting, no cron needed. stripeInvoiceId is the
// idempotency key (Stripe re-delivers webhooks): a unique INDEX + ON CONFLICT DO
// NOTHING makes each grant exactly-once.
export const creditGrants = pgTable(
  "credit_grant",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The source subscription, by Stripe id (string, NOT an FK): the invoice.paid
    // webhook can arrive before our subscription row exists (event ordering), so
    // we must not depend on a foreign row being present.
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeInvoiceId: text("stripe_invoice_id").notNull(),
    amountEur: numeric("amount_eur", { precision: 12, scale: 6 }).notNull(),
    // What is left to spend from this grant (amountEur minus deductions).
    remainingEur: numeric("remaining_eur", {
      precision: 12,
      scale: 6,
    }).notNull(),
    grantedAt: timestamp("granted_at", { mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (g) => [
    uniqueIndex("credit_grant_invoice_idx").on(g.stripeInvoiceId),
    // Hot-path lookup: the pre-flight balance sum + the FOR UPDATE deduction scan
    // read a user's still-spendable grants. Partial (remaining_eur > 0) keeps it
    // tiny as grants drain; expiresAt is filtered at query time.
    index("credit_grant_user_active_idx")
      .on(g.userId, g.expiresAt)
      .where(sql`${g.remainingEur} > 0`),
  ],
);

// Webhook idempotency ledger: one row per Stripe event id we've processed. The
// webhook inserts the id inside the SAME transaction as its writes (ON CONFLICT
// DO NOTHING); a re-delivered event finds the id present and skips. `id` is the
// Stripe event id (evt_…), a natural primary key.
export const stripeEvents = pgTable("stripe_event", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Operational error log (surfaced read-only in the admin panel's /logs view).
// Server-side failures that would otherwise vanish into the container's stdout
// on the next redeploy are persisted here by lib/error-log.ts, so the operator
// can diagnose them (e.g. a failed restore) without SSH-ing onto the VPS. This
// is NOT request-level access logging — only caught exceptions at the route
// handlers, written best-effort (a logging failure never breaks the request).
// ---------------------------------------------------------------------------
export const errorLogs = pgTable(
  "error_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Where it happened, for filtering: "restore" | "agent" | "stripe-webhook"
    // | "cron-backup" | … . Free-form; the writer picks a stable short slug.
    scope: text("scope").notNull(),
    // The affected project/builder-user when known. Plain uuid (no FK / cascade)
    // like publishedBackupId — a log entry must OUTLIVE the row it references so
    // the history survives a project or user deletion.
    projectId: uuid("project_id"),
    userId: uuid("user_id"),
    // The error message (error.message, or String(error) for non-Errors).
    message: text("message").notNull(),
    // The stack trace when available; null otherwise.
    stack: text("stack"),
    // Optional JSON with extra context (e.g. { backupId }), stringified.
    context: text("context"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  // Plain indexes only (never .unique()) so the non-TTY migrate push can't hit
  // the populated-table truncate prompt. Newest-first listing + scope filter.
  (e) => [
    index("error_log_created_idx").on(e.createdAt),
    index("error_log_scope_idx").on(e.scope),
  ],
);
