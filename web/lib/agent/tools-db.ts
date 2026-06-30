import "server-only";
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { readFileRaw } from "@/lib/projects";
import { pool } from "@/lib/db";
import { applyProjectSchema, tenantNames } from "@/lib/appdb/provision";
import { runTenantQuery } from "@/lib/appdb/exec";
import { buildSelect } from "@/lib/appdb/sql";
import type { VfsEvent } from "./tools";

export const DATABASE_PATH = "/database.sql";

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/**
 * In-process MCP server giving the agent control of the project's OPTIONAL,
 * isolated database. The schema is just a VFS file (`/database.sql`); applying
 * it provisions a private Postgres schema + low-privilege role on first use and
 * runs the DDL confined to that schema. Tables with an `owner_id` column become
 * per-end-user-private automatically (RLS). Everything stays scoped to one
 * project — the same isolation boundary as the file tools.
 */
export function buildDatabaseServer(
  projectId: string,
  onEvent: (event: VfsEvent) => void,
) {
  return createSdkMcpServer({
    name: "appdb",
    version: "1.0.0",
    instructions:
      "The app's optional database. Define the schema in /database.sql with the " +
      "file tools, then call apply_schema to create/update it. The running app " +
      "talks to it via window.artefacts.db / window.artefacts.auth — never raw SQL.",
    tools: [
      tool(
        "apply_schema",
        "Provision the project's isolated database (first call) and apply the DDL " +
          "in /database.sql to it. Idempotent — write additive DDL (CREATE TABLE / " +
          "ADD COLUMN IF NOT EXISTS). Any table with an `owner_id uuid` column is " +
          "automatically made per-end-user-private (its owner_id is auto-filled " +
          "from the logged-in user; row-level security hides other users' rows).",
        {},
        async () => {
          const raw = await readFileRaw(projectId, DATABASE_PATH);
          if (!raw || raw.encoding !== "utf8" || raw.content.trim() === "") {
            return err(
              `No schema to apply: write your CREATE TABLE statements to ${DATABASE_PATH} first.`,
            );
          }
          try {
            const { tables, ownerTables } = await applyProjectSchema(
              projectId,
              raw.content,
            );
            onEvent({ type: "database_changed", tables });
            const ownerNote =
              ownerTables.length > 0
                ? ` Per-user (owner_id) tables: ${ownerTables.join(", ")}.`
                : "";
            return ok(
              `Database ready. Tables: ${tables.join(", ") || "(none)"}.${ownerNote}`,
            );
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return err(`Schema apply failed: ${message}`);
          }
        },
      ),

      tool(
        "query_db",
        "Read rows from a table to verify your schema/data while building. Returns " +
          "rows visible to an anonymous caller (per-user tables show no rows here). " +
          "Read-only.",
        { table: z.string(), limit: z.number().int().positive().max(50).optional() },
        async ({ table, limit }) => {
          const { schema, role } = tenantNames(projectId);
          try {
            const built = buildSelect({ table, limit: limit ?? 20 });
            const rows = await runTenantQuery(
              pool,
              { schema, role, endUserId: null },
              built,
            );
            return ok(
              rows.length === 0
                ? `(${table}: no rows)`
                : JSON.stringify(rows, null, 2),
            );
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return err(`Query failed: ${message}`);
          }
        },
      ),
    ],
  });
}

// Tool names as the agent loop sees them (mcp__<server>__<tool>).
export const DATABASE_TOOL_NAMES = [
  "mcp__appdb__apply_schema",
  "mcp__appdb__query_db",
];
