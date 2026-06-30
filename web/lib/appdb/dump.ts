import { ident } from "./sql";

// Pure serializer that turns a tenant data dump into portable INSERT statements
// for the export ZIP. Table/column names are unqualified, so loading the export
// into a plain Postgres lands the data in `public` next to the user's
// database.sql schema. No `pg` import — values arrive already materialized.

export type TableDump = {
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** A safe SQL literal for an exported value. */
function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return quote(value.toISOString());
  // jsonb / array columns come back as objects/arrays — JSON-encode them. (A
  // native Postgres array column would need ARRAY[...]; rare in generated apps.)
  if (typeof value === "object") return quote(JSON.stringify(value));
  return quote(String(value));
}

export function serializeTenantDump(dumps: TableDump[]): string {
  const out: string[] = [
    "-- Data export for your app's database.",
    "-- Load database.sql first to create the tables, then run this file.",
    "",
  ];
  for (const d of dumps) {
    if (d.rows.length === 0) {
      out.push(`-- ${d.table}: (no rows)`, "");
      continue;
    }
    const cols = d.columns.map(ident).join(", ");
    out.push(`-- ${d.table}: ${d.rows.length} row(s)`);
    for (const row of d.rows) {
      const vals = d.columns.map((c) => literal(row[c])).join(", ");
      out.push(`INSERT INTO ${ident(d.table)} (${cols}) VALUES (${vals});`);
    }
    out.push("");
  }
  return out.join("\n");
}
