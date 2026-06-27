import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
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
    // "user" | "assistant" | "system"
    role: text("role").notNull(),
    content: text("content").notNull(),
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
