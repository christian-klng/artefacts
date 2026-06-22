import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
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
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (project) => [index("project_user_idx").on(project.userId)],
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
    content: text("content").notNull().default(""),
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
    // "user" | "assistant" | "system"
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (message) => [index("message_project_idx").on(message.projectId)],
);

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
