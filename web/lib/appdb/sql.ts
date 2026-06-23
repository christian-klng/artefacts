// Pure, dependency-free SQL builders for the per-project data plane.
//
// This module is security-critical and intentionally has NO imports: it is the
// single place that turns untrusted intent (table/column names, filters) into
// SQL text. Two rules keep it safe:
//   1. Identifiers are validated against a strict allowlist regex AND quoted.
//      Anything that isn't a plain [a-z_][a-z0-9_]* token is rejected — this
//      blocks `todos; DROP TABLE x`, embedded quotes, `pg_*` probing, etc.
//   2. Values are NEVER interpolated. They always come back as a parameter
//      array ($1, $2, …) for the driver's extended protocol, which also makes
//      multi-statement injection impossible.
//
// The actual tenant isolation is enforced by Postgres (per-project role +
// RLS) in exec.ts — this layer just shrinks the attack surface.

const IDENT = /^[a-z_][a-z0-9_]*$/;
const MAX_IDENT_LEN = 63; // Postgres identifier limit.

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;

/** Validates a SQL identifier and returns it double-quoted. Throws otherwise. */
export function ident(name: string): string {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name.length > MAX_IDENT_LEN ||
    !IDENT.test(name) ||
    name.startsWith("pg_")
  ) {
    throw new Error(`Invalid SQL identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

/** Single-quoted string literal (only for DO-block role checks, never values). */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// --- Naming -----------------------------------------------------------------

/** Deterministic, injection-safe schema name for a project UUID. */
export function schemaForProject(projectId: string): string {
  return `proj_${projectId.replace(/-/g, "")}`;
}

/** Deterministic, injection-safe role name for a project UUID. */
export function roleForProject(projectId: string): string {
  return `${schemaForProject(projectId)}_role`;
}

// --- Provisioning DDL -------------------------------------------------------

/**
 * Statements to provision a project's isolated schema and the low-privilege
 * role through which ALL of its data access runs. The role gets USAGE+CREATE on
 * ONLY its own schema and nothing else, so neither a malicious query nor
 * malicious DDL from the agent-written /database.sql can reach another tenant.
 */
export function provisionStatements(schema: string, role: string): string[] {
  const s = ident(schema);
  const r = ident(role);
  return [
    `CREATE SCHEMA IF NOT EXISTS ${s}`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(role)}) THEN
         CREATE ROLE ${r} NOLOGIN NOINHERIT;
       END IF;
     END $$`,
    // The role may use and create objects in its own schema — nowhere else.
    `GRANT USAGE, CREATE ON SCHEMA ${s} TO ${r}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${r}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT USAGE, SELECT ON SEQUENCES TO ${r}`,
    // DoS guard: cap how long any tenant query may run.
    `ALTER ROLE ${r} SET statement_timeout = '5000ms'`,
    // Let the connecting (app) user assume this role via SET ROLE.
    `GRANT ${r} TO CURRENT_USER`,
  ];
}

/**
 * Statements that turn a table into a per-end-user private table: only rows the
 * current end-user owns are visible/writable. FORCE is required because the
 * table is owned by the project role itself, and owners bypass RLS otherwise.
 * The end-user id is read from the `app.end_user_id` GUC set per request; when
 * unset (anonymous) it is NULL and no owned rows match.
 */
export function ownerRlsStatements(
  schema: string,
  table: string,
  ownerColumn = "owner_id",
): string[] {
  const t = `${ident(schema)}.${ident(table)}`;
  const col = ident(ownerColumn);
  const owner = `${col} = nullif(current_setting('app.end_user_id', true), '')::uuid`;
  return [
    `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS owner_isolation ON ${t}`,
    `CREATE POLICY owner_isolation ON ${t} USING (${owner}) WITH CHECK (${owner})`,
  ];
}

// --- Constrained query protocol ---------------------------------------------

export type Built = { text: string; values: unknown[] };

const OPERATORS: Record<string, string> = {
  eq: "=",
  neq: "<>",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  like: "LIKE",
  ilike: "ILIKE",
};

export type Filter = { column: string; op: keyof typeof OPERATORS | "in"; value: unknown };

function buildWhere(filters: Filter[] | undefined, params: unknown[]): string {
  if (!filters || filters.length === 0) return "";
  const clauses = filters.map((f) => {
    const col = ident(f.column);
    if (f.op === "in") {
      if (!Array.isArray(f.value)) throw new Error("`in` requires an array value");
      params.push(f.value);
      return `${col} = ANY($${params.length})`;
    }
    const sqlOp = OPERATORS[f.op];
    if (!sqlOp) throw new Error(`Unsupported operator: ${f.op}`);
    params.push(f.value);
    return `${col} ${sqlOp} $${params.length}`;
  });
  return ` WHERE ${clauses.join(" AND ")}`;
}

function clampLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

export function buildSelect(opts: {
  table: string;
  columns?: string[];
  where?: Filter[];
  orderBy?: { column: string; dir?: "asc" | "desc" };
  limit?: number;
  offset?: number;
}): Built {
  const params: unknown[] = [];
  const cols = opts.columns?.length
    ? opts.columns.map(ident).join(", ")
    : "*";
  let text = `SELECT ${cols} FROM ${ident(opts.table)}`;
  text += buildWhere(opts.where, params);
  if (opts.orderBy) {
    const dir = opts.orderBy.dir === "desc" ? "DESC" : "ASC";
    text += ` ORDER BY ${ident(opts.orderBy.column)} ${dir}`;
  }
  text += ` LIMIT ${clampLimit(opts.limit)}`;
  if (opts.offset && opts.offset > 0) text += ` OFFSET ${Math.floor(opts.offset)}`;
  return { text, values: params };
}

export function buildInsert(opts: {
  table: string;
  values: Record<string, unknown>;
}): Built {
  const entries = Object.entries(opts.values);
  if (entries.length === 0) throw new Error("insert requires at least one value");
  const cols = entries.map(([c]) => ident(c)).join(", ");
  const params = entries.map(([, v]) => v);
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
  return {
    text: `INSERT INTO ${ident(opts.table)} (${cols}) VALUES (${placeholders}) RETURNING *`,
    values: params,
  };
}

export function buildUpdate(opts: {
  table: string;
  values: Record<string, unknown>;
  where?: Filter[];
}): Built {
  const entries = Object.entries(opts.values);
  if (entries.length === 0) throw new Error("update requires at least one value");
  const params: unknown[] = [];
  const sets = entries.map(([c, v]) => {
    params.push(v);
    return `${ident(c)} = $${params.length}`;
  });
  let text = `UPDATE ${ident(opts.table)} SET ${sets.join(", ")}`;
  text += buildWhere(opts.where, params);
  text += " RETURNING *";
  return { text, values: params };
}

export function buildDelete(opts: { table: string; where?: Filter[] }): Built {
  const params: unknown[] = [];
  let text = `DELETE FROM ${ident(opts.table)}`;
  text += buildWhere(opts.where, params);
  text += " RETURNING *";
  return { text, values: params };
}
