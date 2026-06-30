// Security spike: proves the per-project data plane isolates tenants at the
// Postgres level, NOT by trusting application code.
//
// It uses the REAL SQL from lib/appdb/sql.ts (provisioning, RLS policies, query
// builders); only the ~6-line transaction wrapper from exec.ts is mirrored
// inline so the script stays a single standalone file.
//
// Trust model under test (matches production):
//   - a non-superuser app role ("spike_app") connects and is a member of every
//     project role, so it can SET ROLE into any tenant to serve requests;
//   - each tenant query runs under SET LOCAL ROLE <project_role> with the
//     search_path pinned and the end-user id in a GUC that RLS reads.
//
// Run:  node scripts/security-spike.mjs "postgresql://user:pass@host:port/db"
//   (the connection user must be a superuser, e.g. a throwaway local Postgres)

import { Pool } from "pg";
import {
  provisionStatements,
  ownerRlsStatements,
  ownerColumnDefaultStatement,
  schemaForProject,
  roleForProject,
  buildSelect,
  buildInsert,
  buildUpdate,
  ident,
} from "../lib/appdb/sql.ts";

const SUPER_URL = process.argv[2] || process.env.SPIKE_DATABASE_URL;
if (!SUPER_URL) {
  console.error("Usage: node scripts/security-spike.mjs <superuser DATABASE_URL>");
  process.exit(2);
}

// Two fake projects and two end-users within project A.
const PROJ_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJ_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

const SCHEMA_A = schemaForProject(PROJ_A);
const SCHEMA_B = schemaForProject(PROJ_B);
const ROLE_A = roleForProject(PROJ_A);
const ROLE_B = roleForProject(PROJ_B);

const APP_ROLE = "spike_app";
const APP_PASSWORD = "spike_pw";

// --- tiny assertion harness -------------------------------------------------
let pass = 0;
let fail = 0;
function ok(label, cond) {
  if (cond) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${label}`);
  }
}
async function denied(label, fn) {
  try {
    await fn();
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${label} (expected error, none thrown)`);
  } catch (e) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m ${label} -> ${e.code || e.message}`);
  }
}

// Mirrors exec.ts runTenantQuery: one parameterized statement under the tenant
// role with search_path + end-user GUC, in its own transaction.
async function asTenant(pool, { schema, role, endUserId }, text, values = []) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${ident(role)}`);
    await client.query(`SET LOCAL search_path TO ${ident(schema)}`);
    await client.query("SELECT set_config('app.end_user_id', $1, true)", [
      endUserId ?? "",
    ]);
    const res = await client.query(text, values);
    await client.query("COMMIT");
    return res.rows;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

function appUrl() {
  const u = new URL(SUPER_URL.replace("postgresql://", "http://").replace("postgres://", "http://"));
  u.username = APP_ROLE;
  u.password = APP_PASSWORD;
  return "postgresql://" + u.host + u.pathname + "?user=" + APP_ROLE + "&password=" + APP_PASSWORD;
}

async function cleanup(su) {
  for (const sch of [SCHEMA_A, SCHEMA_B]) {
    await su.query(`DROP SCHEMA IF EXISTS ${ident(sch)} CASCADE`).catch(() => {});
  }
  await su.query(`DROP TABLE IF EXISTS public.spike_secret`).catch(() => {});
  for (const r of [ROLE_A, ROLE_B, APP_ROLE]) {
    await su.query(`DROP OWNED BY ${ident(r)} CASCADE`).catch(() => {});
    await su.query(`DROP ROLE IF EXISTS ${ident(r)}`).catch(() => {});
  }
}

async function main() {
  const su = new Pool({ connectionString: SUPER_URL, connectionTimeoutMillis: 4000 });

  console.log("\n# Setup");
  await cleanup(su);

  // A non-superuser app role that connects and serves all tenants.
  await su.query(
    `CREATE ROLE ${ident(APP_ROLE)} LOGIN NOSUPERUSER NOINHERIT CREATEROLE PASSWORD '${APP_PASSWORD}'`,
  );
  // Simulated app/auth table the tenants must never reach.
  await su.query(`CREATE TABLE public.spike_secret (email text, secret text)`);
  await su.query(`INSERT INTO public.spike_secret VALUES ('victim@x.com','TOPSECRET')`);

  // Provision both projects with the REAL provisioning SQL, then let the app
  // role assume either project role.
  for (const [schema, role] of [[SCHEMA_A, ROLE_A], [SCHEMA_B, ROLE_B]]) {
    for (const stmt of provisionStatements(schema, role)) await su.query(stmt);
    await su.query(`GRANT ${ident(role)} TO ${ident(APP_ROLE)}`);
  }
  console.log("  provisioned", SCHEMA_A, "and", SCHEMA_B, "+ app role");

  const app = new Pool({ connectionString: appUrl(), connectionTimeoutMillis: 4000 });

  // Each project builds a `todos` table (real DDL via the app role) with
  // owner-based RLS (real ownerRlsStatements).
  for (const [schema, role] of [[SCHEMA_A, ROLE_A], [SCHEMA_B, ROLE_B]]) {
    const ddl =
      `CREATE TABLE todos (id uuid primary key default gen_random_uuid(),` +
      ` owner_id uuid, title text)`;
    await asTenant(app, { schema, role }, ddl);
    // Mirror applyOwnerSecurity(): auto-stamp owner_id from the GUC + RLS.
    await asTenant(app, { schema, role }, ownerColumnDefaultStatement(schema, "todos"));
    for (const stmt of ownerRlsStatements(schema, "todos")) {
      await asTenant(app, { schema, role }, stmt);
    }
  }

  // Seed project A: one row for U1, one for U2 (insert satisfies WITH CHECK
  // because the GUC matches owner_id).
  const insU1 = buildInsert({ table: "todos", values: { owner_id: U1, title: "u1 private" } });
  const insU2 = buildInsert({ table: "todos", values: { owner_id: U2, title: "u2 private" } });
  await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U1 }, insU1.text, insU1.values);
  await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U2 }, insU2.text, insU2.values);
  console.log("  seeded project A with U1 + U2 rows");

  console.log("\n# Cross-tenant isolation (project A role attacking)");
  await denied("A cannot read project B's table", () =>
    asTenant(app, { schema: SCHEMA_A, role: ROLE_A }, `SELECT * FROM ${ident(SCHEMA_B)}.todos`),
  );
  await denied("A cannot read the app/auth table (public.spike_secret)", () =>
    asTenant(app, { schema: SCHEMA_A, role: ROLE_A }, `SELECT * FROM public.spike_secret`),
  );
  await denied("A cannot create objects outside its schema (public)", () =>
    asTenant(app, { schema: SCHEMA_A, role: ROLE_A }, `CREATE TABLE public.evil (x int)`),
  );
  await denied("A cannot drop project B's schema", () =>
    asTenant(app, { schema: SCHEMA_A, role: ROLE_A }, `DROP SCHEMA ${ident(SCHEMA_B)} CASCADE`),
  );

  console.log("\n# Row-level security (end-user isolation within project A)");
  const sel = buildSelect({ table: "todos" });
  const rowsU1 = await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U1 }, sel.text, sel.values);
  const rowsU2 = await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U2 }, sel.text, sel.values);
  const rowsAnon = await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: null }, sel.text, sel.values);
  ok("U1 sees exactly its own 1 row", rowsU1.length === 1 && rowsU1[0].title === "u1 private");
  ok("U2 sees exactly its own 1 row", rowsU2.length === 1 && rowsU2[0].title === "u2 private");
  ok("anonymous sees 0 rows", rowsAnon.length === 0);

  // U1 tries to overwrite everything; RLS confines the UPDATE to U1's rows.
  const upd = buildUpdate({ table: "todos", values: { title: "HACKED" } });
  const updated = await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U1 }, upd.text, upd.values);
  ok("U1's blanket UPDATE touches only its own row", updated.length === 1);
  const u2After = await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U2 }, sel.text, sel.values);
  ok("U2's row is unchanged after U1's attack", u2After.length === 1 && u2After[0].title === "u2 private");

  console.log("\n# owner_id auto-stamp (insert WITHOUT owner_id takes the GUC)");
  // The client never sends owner_id; the column default fills it from the GUC.
  const insAuto = buildInsert({ table: "todos", values: { title: "auto-owned" } });
  await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U1 }, insAuto.text, insAuto.values);
  const u1Rows = await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U1 }, sel.text, sel.values);
  const u2Rows = await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U2 }, sel.text, sel.values);
  const autoRow = u1Rows.find((r) => r.title === "auto-owned");
  ok("auto-stamped row is owned by the inserting user (U1)", !!autoRow && autoRow.owner_id === U1);
  ok("U1 now sees its 2 rows", u1Rows.length === 2);
  ok("U2 still sees only its own row (auto-stamped row hidden)", u2Rows.length === 1);
  // Anonymous insert: GUC empty -> owner_id NULL -> RLS WITH CHECK rejects it.
  await denied("anonymous insert into an owner table is blocked by RLS", () =>
    asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: null }, insAuto.text, insAuto.values),
  );

  console.log("\n# Query-builder attack surface (real sql.ts)");
  await (async () => {
    try { ident("todos; DROP TABLE todos"); ok("ident() rejects statement injection", false); }
    catch { ok("ident() rejects statement injection", true); }
  })();
  await (async () => {
    try { ident('a" OR "1"="1'); ok("ident() rejects quote injection", false); }
    catch { ok("ident() rejects quote injection", true); }
  })();
  await (async () => {
    try { ident("pg_authid"); ok("ident() rejects pg_ catalog probing", false); }
    catch { ok("ident() rejects pg_ catalog probing", true); }
  })();
  {
    const malicious = buildSelect({ table: "todos", where: [{ column: "title", op: "eq", value: "x'; DROP TABLE todos; --" }] });
    ok("malicious value stays a bound param, not SQL",
      malicious.values.length === 1 && malicious.values[0] === "x'; DROP TABLE todos; --" && !malicious.text.includes("DROP"));
    // And it actually runs harmlessly against the DB.
    await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U1 }, malicious.text, malicious.values);
    const stillThere = await asTenant(app, { schema: SCHEMA_A, role: ROLE_A, endUserId: U1 }, sel.text, sel.values);
    ok("todos table still exists after injection attempt", stillThere.length >= 1);
  }

  console.log("\n# Cleanup");
  await app.end();
  await cleanup(su);
  await su.end();

  console.log(`\nResult: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nSpike crashed:", e);
  process.exit(3);
});
