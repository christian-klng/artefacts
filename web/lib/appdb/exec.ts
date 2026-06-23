// Runtime executor for the per-project data plane.
//
// Every tenant query runs inside a transaction that first drops privileges to
// the project's low-privilege role and pins the search_path to its schema, then
// sets the end-user id GUC that RLS policies read. Because these are SET LOCAL,
// they are scoped to the transaction and cannot leak to the next caller on a
// pooled connection.
//
// Note: `ALTER ROLE … SET search_path` does NOT take effect under SET ROLE
// (it only applies when connecting AS that role), so we set search_path
// explicitly here. Identifiers are pre-validated by sql.ts before they arrive.

import type { Built } from "./sql";

// Minimal structural type so this module needs no `pg` value import and can be
// exercised by the standalone security spike with its own pool.
export interface PoolClientLike {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(): void;
}
export interface PoolLike {
  connect(): Promise<PoolClientLike>;
}

export type TenantContext = {
  /** Quoted-safe schema name, e.g. proj_abc. Must already be validated. */
  schema: string;
  /** Quoted-safe role name. Must already be validated. */
  role: string;
  /** Authenticated end-user id, or null/undefined for anonymous access. */
  endUserId?: string | null;
};

import { ident } from "./sql";

/**
 * Runs one built (parameterized) query under the tenant's role + RLS context.
 * Throws if anything in the transaction fails (e.g. permission denied), which
 * is exactly what we want for cross-tenant attempts.
 */
export async function runTenantQuery(
  pool: PoolLike,
  ctx: TenantContext,
  built: Built,
): Promise<unknown[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${ident(ctx.role)}`);
    await client.query(`SET LOCAL search_path TO ${ident(ctx.schema)}`);
    // Parameterized so the id can never be SQL; empty string = anonymous.
    await client.query("SELECT set_config('app.end_user_id', $1, true)", [
      ctx.endUserId ?? "",
    ]);
    const res = await client.query(built.text, built.values);
    await client.query("COMMIT");
    return res.rows;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Applies agent-authored DDL (the project's /database.sql) under the project
 * role, so even hostile DDL is confined to the project schema: the role has no
 * privileges to create objects elsewhere or drop another schema. Runs as a
 * single transaction — partial schemas never land.
 */
export async function applyTenantDdl(
  pool: PoolLike,
  ctx: Pick<TenantContext, "schema" | "role">,
  ddl: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${ident(ctx.role)}`);
    await client.query(`SET LOCAL search_path TO ${ident(ctx.schema)}`);
    await client.query(ddl);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
