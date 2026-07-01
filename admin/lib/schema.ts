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
