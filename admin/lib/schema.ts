import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// A READ-ONLY subset of the builder's schema (web/lib/db/schema.ts), limited to
// the tables/columns the admin panel reads. Column names and DB table names MUST
// stay in sync with the builder — this points at the same Postgres database.

export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const projects = pgTable("project", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("userId").notNull(),
  name: text("name").notNull(),
  template: text("template").notNull(),
  published: boolean("published").notNull(),
  publishSlug: text("publish_slug"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const userCredits = pgTable("user_credit", {
  userId: uuid("userId").notNull().primaryKey(),
  balanceEur: numeric("balance_eur", { precision: 12, scale: 6 }).notNull(),
  freeGrantedEur: numeric("free_granted_eur", {
    precision: 12,
    scale: 6,
  }).notNull(),
});

export const usageEvents = pgTable("usage_event", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("userId").notNull(),
  billedEur: numeric("billed_eur", { precision: 12, scale: 6 }).notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
});

// Editable email templates (welcome, password reset). Unlike the other tables
// here, the admin app WRITES this one. The builder reads it (web/lib/
// mail-templates.ts) and falls back to its code defaults when a row is missing
// or its body is blank. key = "welcome" | "reset".
export const mailTemplates = pgTable("mail_template", {
  key: text("key").primaryKey(),
  subject: text("subject").notNull().default(""),
  html: text("html").notNull().default(""),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

// Editable operational settings (Cortecs router, billing constants, SMTP mail
// config). Like mail_template, the admin app WRITES this one and the builder
// reads it (web/lib/settings.ts) with precedence DB > env > default. `key`
// mirrors the matching env var name. Only NON-secret values live here.
export const appSettings = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

// Coupons / referral credit (mirrors web/lib/db/schema.ts). The admin READS all
// coupons + redemptions and WRITES new "admin" coupons. Indexes/constraints live
// on the real table (created by the builder's migrate) — the mirror omits them.
export const coupons = pgTable("coupon", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  ownerId: uuid("owner_id"),
  kind: text("kind").notNull(),
  recipientAmountEur: numeric("recipient_amount_eur", {
    precision: 12,
    scale: 6,
  }).notNull(),
  referrerAmountEur: numeric("referrer_amount_eur", {
    precision: 12,
    scale: 6,
  })
    .notNull()
    .default("0"),
  referrerRequiresSubscription: boolean("referrer_requires_subscription")
    .notNull()
    .default(true),
  rewardWindowDays: integer("reward_window_days").notNull().default(14),
  maxRedemptions: integer("max_redemptions"),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  active: boolean("active").notNull().default(true),
  createdByAdmin: boolean("created_by_admin").notNull().default(false),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const couponRedemptions = pgTable("coupon_redemption", {
  id: uuid("id").defaultRandom().primaryKey(),
  couponId: uuid("coupon_id").notNull(),
  redeemerId: uuid("redeemer_id").notNull(),
  couponKind: text("coupon_kind").notNull(),
  recipientCreditedEur: numeric("recipient_credited_eur", {
    precision: 12,
    scale: 6,
  }).notNull(),
  ownerId: uuid("owner_id"),
  referrerRewardEur: numeric("referrer_reward_eur", {
    precision: 12,
    scale: 6,
  }).notNull(),
  referrerRewardStatus: text("referrer_reward_status").notNull(),
  referrerRewardDeadline: timestamp("referrer_reward_deadline", {
    mode: "date",
  }),
  redeemedAt: timestamp("redeemed_at", { mode: "date" }).notNull().defaultNow(),
});
