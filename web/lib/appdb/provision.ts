import "server-only";
import { eq } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import {
  provisionStatements,
  ownerColumnDefaultStatement,
  ownerRlsStatements,
  schemaForProject,
  roleForProject,
  ident,
  buildUpdate,
  buildDelete,
  type Built,
  type Filter,
} from "./sql";
import { applyTenantDdl } from "./exec";
import type { TableDump } from "./dump";

// Control-plane operations for the per-project data plane: creating a project's
// isolated schema + role, applying its agent-authored DDL, and reading its data
// back for export. The runtime query path (serving end-user requests) lives in
// exec.ts; this module is the privileged side that only the builder ever runs.
//
// Trust split:
//   - provisioning DDL (CREATE SCHEMA/ROLE/GRANT) runs as the connecting admin
//     user — the tenant role has no privilege to create roles or other schemas;
//   - agent DDL and owner-column hardening run UNDER the tenant role, so even
//     hostile DDL is confined to the project schema (see exec.ts).

export type TenantNames = { schema: string; role: string };

export function tenantNames(projectId: string): TenantNames {
  return {
    schema: schemaForProject(projectId),
    role: roleForProject(projectId),
  };
}

/**
 * Idempotently creates the project's isolated schema + low-privilege role and
 * flips `databaseEnabled`. Runs as the connecting (admin) user because creating
 * a schema/role needs privileges the tenant role intentionally lacks. Safe to
 * call on every apply_schema.
 */
export async function ensureProvisioned(projectId: string): Promise<TenantNames> {
  const names = tenantNames(projectId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const stmt of provisionStatements(names.schema, names.role)) {
      await client.query(stmt);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  await db
    .update(projects)
    .set({
      databaseEnabled: true,
      dbProvisionedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
  return names;
}

/** Base-table names in a project's schema (introspection runs as admin). */
export async function listTenantTables(projectId: string): Promise<string[]> {
  const { schema } = tenantNames(projectId);
  const res = await pool.query(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    [schema],
  );
  return res.rows.map((r: { table_name: string }) => r.table_name);
}

export type TableMeta = { name: string; ownerScoped: boolean };

/** Tables + whether each is per-end-user private (has an owner_id column). */
export async function listTenantTableMeta(
  projectId: string,
): Promise<TableMeta[]> {
  const { schema } = tenantNames(projectId);
  const res = await pool.query(
    `SELECT t.table_name,
            EXISTS (
              SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = t.table_schema
                  AND c.table_name = t.table_name
                  AND c.column_name = 'owner_id'
            ) AS owner_scoped
       FROM information_schema.tables t
      WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name`,
    [schema],
  );
  return res.rows.map((r: { table_name: string; owner_scoped: boolean }) => ({
    name: r.table_name,
    ownerScoped: r.owner_scoped,
  }));
}

/**
 * A page of rows from one tenant table for the owner's read-only data viewer.
 * Runs as admin with row_security OFF so the app owner sees ALL rows across
 * end-users (this is the builder inspecting their own app's data, not an
 * end-user request). The table name is checked against the real inventory
 * before use, on top of ident() validation.
 */
export async function readTablePage(
  projectId: string,
  table: string,
  limit = 50,
  offset = 0,
): Promise<{
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  primaryKey: string[];
}> {
  const { schema } = tenantNames(projectId);
  const tables = await listTenantTables(projectId);
  if (!tables.includes(table)) throw new Error(`Unknown table: ${table}`);
  // The PK identifies a row for the owner's edit/delete actions; empty when the
  // table has none (→ the viewer keeps that table read-only).
  const primaryKey = await pkColumns(schema, table);
  const t = `${ident(schema)}.${ident(table)}`;
  const lim = Math.max(1, Math.min(200, Math.floor(limit)));
  const off = Math.max(0, Math.floor(offset));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL row_security = off");
    const countRes = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
    const total = (countRes.rows[0] as { n: number }).n;
    // ORDER BY 1 (first column, usually the id) keeps pages stable.
    const res = await client.query(
      `SELECT * FROM ${t} ORDER BY 1 LIMIT ${lim} OFFSET ${off}`,
    );
    await client.query("COMMIT");
    return {
      columns: res.fields.map((f: { name: string }) => f.name),
      rows: res.rows as Record<string, unknown>[],
      total,
      primaryKey,
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// --- Owner row editing (Way 3 Phase 4) --------------------------------------
// The app owner's read/write data management, distinct from the end-user runtime
// path (exec.ts, project role + RLS). Everything here runs as the ADMIN
// connection with row_security OFF and the search_path pinned — the same trust
// level as readTablePage — so the owner can edit/delete ANY end-user's row from
// the "Daten" tab. Table names are validated against the real inventory and all
// identifiers/values still go through the injection-safe builders in sql.ts.

/** Primary-key column names of a tenant table, in key order (empty if none). */
async function pkColumns(schema: string, table: string): Promise<string[]> {
  const rel = `${ident(schema)}.${ident(table)}`;
  const res = await pool.query(
    `SELECT a.attname AS col
       FROM pg_index i
       JOIN pg_attribute a
         ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey::int2[])
      WHERE i.indrelid = to_regclass($1) AND i.indisprimary
      ORDER BY array_position(i.indkey::int2[], a.attnum)`,
    [rel],
  );
  return res.rows.map((r: { col: string }) => r.col);
}

/** Public PK lookup: validates the table against the inventory first. */
export async function tablePrimaryKey(
  projectId: string,
  table: string,
): Promise<string[]> {
  const { schema } = tenantNames(projectId);
  const tables = await listTenantTables(projectId);
  if (!tables.includes(table)) throw new Error(`Unknown table: ${table}`);
  return pkColumns(schema, table);
}

/**
 * WHERE filters that target exactly one row by its primary key. Requires the
 * table to HAVE a primary key and the caller to supply every PK column — this is
 * what guarantees an UPDATE/DELETE can never accidentally run without a WHERE
 * (which would hit every row) or match more than one row.
 */
async function pkFilters(
  projectId: string,
  table: string,
  pk: Record<string, unknown>,
): Promise<Filter[]> {
  const cols = await tablePrimaryKey(projectId, table);
  if (cols.length === 0) {
    throw new Error(
      "Diese Tabelle hat keinen Primärschlüssel und kann nicht zeilenweise bearbeitet werden.",
    );
  }
  return cols.map((column) => {
    if (pk == null || !(column in pk)) {
      throw new Error("Zeilen-Schlüssel unvollständig.");
    }
    return { column, op: "eq" as const, value: pk[column] };
  });
}

/** Runs a built UPDATE/DELETE as admin (row_security off), search_path pinned. */
async function runOwnerWrite(
  projectId: string,
  built: Built,
): Promise<Record<string, unknown>[]> {
  const { schema } = tenantNames(projectId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL row_security = off");
    await client.query(`SET LOCAL search_path TO ${ident(schema)}`);
    const res = await client.query(built.text, built.values);
    await client.query("COMMIT");
    return res.rows as Record<string, unknown>[];
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Updates a single row (identified by its full primary key) as the app owner.
 * Identity (PK) columns are never changed — they only target the row. Returns
 * the updated row, or null if the PK matched nothing.
 */
export async function updateTableRow(
  projectId: string,
  table: string,
  pk: Record<string, unknown>,
  values: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const where = await pkFilters(projectId, table, pk);
  const editable = { ...values };
  for (const f of where) delete editable[f.column];
  if (Object.keys(editable).length === 0) throw new Error("Keine Änderungen.");
  const built = buildUpdate({ table, values: editable, where });
  const rows = await runOwnerWrite(projectId, built);
  return rows[0] ?? null;
}

/** Deletes a single row by its full primary key. Returns the number removed. */
export async function deleteTableRow(
  projectId: string,
  table: string,
  pk: Record<string, unknown>,
): Promise<number> {
  const where = await pkFilters(projectId, table, pk);
  const built = buildDelete({ table, where });
  const rows = await runOwnerWrite(projectId, built);
  return rows.length;
}

/** Tables in the schema that carry an `owner_id` column (→ per-user RLS). */
async function ownerTables(schema: string): Promise<string[]> {
  const res = await pool.query(
    `SELECT table_name FROM information_schema.columns
       WHERE table_schema = $1 AND column_name = 'owner_id'
       ORDER BY table_name`,
    [schema],
  );
  return res.rows.map((r: { table_name: string }) => r.table_name);
}

/**
 * The single convention that drives end-user privacy: every table with an
 * `owner_id uuid` column gets (a) that column auto-stamped from the end-user
 * GUC on insert and (b) per-owner RLS. Tables without `owner_id` stay shared
 * app data. Idempotent — re-running just re-asserts the default + policy. Runs
 * under the project role (the table owner) in one transaction.
 */
export async function applyOwnerSecurity(projectId: string): Promise<string[]> {
  const { schema, role } = tenantNames(projectId);
  const tables = await ownerTables(schema);
  if (tables.length === 0) return [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${ident(role)}`);
    await client.query(`SET LOCAL search_path TO ${ident(schema)}`);
    for (const table of tables) {
      await client.query(ownerColumnDefaultStatement(schema, table));
      for (const stmt of ownerRlsStatements(schema, table)) {
        await client.query(stmt);
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return tables;
}

/**
 * Provisions if needed, applies the project's `/database.sql` under its role,
 * then hardens any owner_id tables. Returns the resulting table inventory for
 * the agent's confirmation message.
 */
export async function applyProjectSchema(
  projectId: string,
  ddl: string,
): Promise<{ tables: string[]; ownerTables: string[] }> {
  const names = await ensureProvisioned(projectId);
  await applyTenantDdl(pool, names, ddl);
  const secured = await applyOwnerSecurity(projectId);
  const tables = await listTenantTables(projectId);
  return { tables, ownerTables: secured };
}

/**
 * Reads every row of every tenant table for export. Runs as the admin
 * connection with row_security OFF so the dump includes ALL end-users' rows
 * (RLS would otherwise scope it to one owner). The provisioning user can bypass
 * RLS (superuser, as in our deploys); if it ever can't, the dump simply returns
 * the rows visible to it.
 */
export async function dumpTenantData(projectId: string): Promise<TableDump[]> {
  const { schema } = tenantNames(projectId);
  const tables = await listTenantTables(projectId);
  if (tables.length === 0) return [];
  const out: TableDump[] = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL row_security = off");
    for (const table of tables) {
      const res = await client.query(
        `SELECT * FROM ${ident(schema)}.${ident(table)}`,
      );
      out.push({
        table,
        columns: res.fields.map((f: { name: string }) => f.name),
        rows: res.rows as Record<string, unknown>[],
      });
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return out;
}

/**
 * Drops a project's tenant schema and everything in it. Runs as the connecting
 * (admin) user because the SCHEMA is owned by that user, not the tenant role —
 * a `SET LOCAL ROLE` drop would fail. The cluster-global role survives (only
 * removed by nothing here); `ensureProvisioned` re-grants it on the recreated
 * schema. Used by the full-backup restore to reset the DB before replaying a
 * backup's DDL + data. Idempotent.
 */
export async function dropTenantSchema(projectId: string): Promise<void> {
  const { schema } = tenantNames(projectId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DROP SCHEMA IF EXISTS ${ident(schema)} CASCADE`);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Replays a serialized data dump (serializeTenantDump output) into a freshly
 * re-provisioned tenant schema. Runs as the admin connection with:
 *   - row_security = off        → cross-owner rows insert despite per-owner RLS;
 *   - session_replication_role = replica → skips FK-ordering + suppresses the
 *     owner_id-stamping trigger path, so the EXPLICIT owner_id in each dumped
 *     row is preserved verbatim (the column DEFAULT never fires);
 *   - search_path pinned to the schema → the dump's UNQUALIFIED
 *     `INSERT INTO "table"` statements land in this project's schema.
 * Must run AFTER applyTenantDdl (tables exist) and BEFORE applyOwnerSecurity.
 * Requires a superuser DATABASE_URL (as our deploys use). No-op for empty SQL.
 * NOTE: does not reset SERIAL/IDENTITY sequences to max(id); generated apps use
 * uuid PKs in practice — a setval pass is a documented follow-up.
 */
export async function restoreTenantData(
  projectId: string,
  dataSql: string,
): Promise<void> {
  if (!dataSql.trim()) return;
  const { schema } = tenantNames(projectId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL row_security = off");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(`SET LOCAL search_path TO ${ident(schema)}`);
    await client.query(dataSql);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
