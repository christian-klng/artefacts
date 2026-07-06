// End-to-end test of the PUBLISH-WITH-DATABASE flow (Way 3 Phase 4).
//
// Unlike the security spike (which proves the isolation SQL in the abstract),
// this drives the REAL production code paths against a throwaway Postgres:
//   - seeds a user + project + VFS files with the real Drizzle client;
//   - provisions the per-project DB the same way the `apply_schema` agent tool
//     does (lib/appdb/provision.applyProjectSchema);
//   - PUBLISHES via the real lib/projects.publishProject (freezes a full backup);
//   - then calls the ACTUAL Next route handlers (app/api/appauth + app/api/appdb
//     + app/serve) with requests whose Host is the PUBLISHED subdomain
//     <slug>.apps.<APPS_DOMAIN> — exactly what a browser on the live app sends.
//
// It asserts the whole "website with a database" story works once published:
// signup → login → /me, per-user CRUD directories, owner_id RLS isolation,
// anonymous lockout, the host gating, and the window.artefacts SDK injection.
//
// Run via scripts/run-publish-db-e2e.mjs (boots embedded Postgres + hooks).

import { eq } from "drizzle-orm";
import { db, pool } from "../lib/db/index.ts";
import { users, projects, files } from "../lib/db/schema.ts";
import { applyProjectSchema } from "../lib/appdb/provision.ts";
import { publishProject } from "../lib/projects.ts";
import { POST as appauthPOST, GET as appauthGET } from "../app/api/appauth/route.ts";
import { POST as appdbPOST } from "../app/api/appdb/route.ts";
import { GET as serveGET } from "../app/serve/route.ts";

const APPS_DOMAIN = process.env.APPS_DOMAIN || "apps.localhost";

// --- tiny assertion harness (same shape as security-spike.mjs) --------------
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

// --- request plumbing against the real handlers -----------------------------
// Handlers read the app host from x-app-host first (proxy.ts pins it there), so
// we avoid the fetch/undici "host" forbidden-header problem entirely.
function req(path, { host, cookie, body, method = "POST", appPath } = {}) {
  const headers = { "x-app-host": host };
  if (cookie) headers["cookie"] = cookie;
  if (appPath) headers["x-app-path"] = appPath;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://${APPS_DOMAIN}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function sessionCookie(res) {
  const raw =
    (res.headers.getSetCookie && res.headers.getSetCookie()[0]) ||
    res.headers.get("set-cookie") ||
    "";
  const m = /artefacts_app_session=([^;]*)/.exec(raw);
  return m && m[1] ? `artefacts_app_session=${m[1]}` : null;
}

async function callJson(handler, request) {
  const res = await handler(request);
  const cookie = sessionCookie(res);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, cookie };
}

const DDL =
  "CREATE TABLE todos (id uuid primary key default gen_random_uuid()," +
  " owner_id uuid, title text not null);";

async function main() {
  console.log("\n# Seed: user + project + VFS files");
  const [owner] = await db
    .insert(users)
    .values({ email: "owner@example.com", name: "Owner" })
    .returning();
  const [proj] = await db
    .insert(projects)
    .values({ userId: owner.id, name: "My Todos" })
    .returning();
  await db.insert(files).values([
    {
      projectId: proj.id,
      path: "/index.html",
      content:
        "<!doctype html><html><head><title>Todos</title></head><body><h1>Todos</h1></body></html>",
    },
    { projectId: proj.id, path: "/database.sql", content: DDL },
  ]);
  console.log("  project", proj.id);

  console.log("\n# Provision DB via the real apply_schema path");
  const applied = await applyProjectSchema(proj.id, DDL);
  ok("apply_schema created the todos table", applied.tables.includes("todos"));
  ok(
    "todos hardened as an owner_id (per-user private) table",
    applied.ownerTables.includes("todos"),
  );

  console.log("\n# Publish via the real publishProject (freezes a full backup)");
  const { slug, firstPublish } = await publishProject(proj.id, owner.id);
  ok("publishProject returned a slug", !!slug);
  ok("first publish flagged", firstPublish === true);
  const HOST = `${slug}.${APPS_DOMAIN}`;
  console.log("  published at", HOST);

  // Confirm the DB flag actually persisted on the published project row.
  const row = await db.query.projects.findFirst({
    where: eq(projects.id, proj.id),
  });
  ok("published project is databaseEnabled", row?.databaseEnabled === true);
  ok("published project marked published", row?.published === true);

  console.log("\n# Host gating (resolveAppContext) on the PUBLISHED host");
  {
    // Unknown slug → 404.
    const r = await callJson(
      appdbPOST,
      req("/api/appdb", { host: `nope.${APPS_DOMAIN}`, body: { table: "todos", op: "select" } }),
    );
    ok("unknown published slug → 404", r.status === 404);
  }
  {
    // Preview host without the signed token → 403 (the builder's gated view).
    const r = await callJson(
      appdbPOST,
      req("/api/appdb", {
        host: `preview-${proj.id}.${APPS_DOMAIN}`,
        body: { table: "todos", op: "select" },
      }),
    );
    ok("preview host without token → 403", r.status === 403);
  }

  console.log("\n# End-user auth on the published app (window.artefacts.auth)");
  // Anonymous /me.
  {
    const r = await callJson(appauthGET, req("/api/appauth", { host: HOST, method: "GET" }));
    ok("anonymous /me returns null user", r.status === 200 && r.body?.user === null);
  }
  // Signup U1.
  const u1 = await callJson(
    appauthPOST,
    req("/api/appauth", {
      host: HOST,
      body: { action: "signup", email: "alice@example.com", password: "alice-secret" },
    }),
  );
  ok("signup U1 → 200 + session cookie", u1.status === 200 && !!u1.cookie);
  ok("signup U1 returns the user", u1.body?.user?.email === "alice@example.com");
  const cookie1 = u1.cookie;

  // Duplicate signup rejected.
  {
    const r = await callJson(
      appauthPOST,
      req("/api/appauth", {
        host: HOST,
        body: { action: "signup", email: "alice@example.com", password: "another-one" },
      }),
    );
    ok("duplicate email signup → 400", r.status === 400);
  }
  // Signup U2.
  const u2 = await callJson(
    appauthPOST,
    req("/api/appauth", {
      host: HOST,
      body: { action: "signup", email: "bob@example.com", password: "bob-secret-1" },
    }),
  );
  ok("signup U2 → 200 + session cookie", u2.status === 200 && !!u2.cookie);
  const cookie2 = u2.cookie;

  // Login: wrong then right.
  {
    const bad = await callJson(
      appauthPOST,
      req("/api/appauth", {
        host: HOST,
        body: { action: "login", email: "alice@example.com", password: "WRONG-pass" },
      }),
    );
    ok("login with wrong password → 401", bad.status === 401);
    const good = await callJson(
      appauthPOST,
      req("/api/appauth", {
        host: HOST,
        body: { action: "login", email: "alice@example.com", password: "alice-secret" },
      }),
    );
    ok("login with correct password → 200 + cookie", good.status === 200 && !!good.cookie);
  }
  // /me with a session.
  {
    const r = await callJson(
      appauthGET,
      req("/api/appauth", { host: HOST, method: "GET", cookie: cookie1 }),
    );
    ok("/me with session returns the logged-in user", r.body?.user?.email === "alice@example.com");
  }

  console.log("\n# Directory CRUD + owner_id RLS on the published app (window.artefacts.db)");
  const u1Id = u1.body.user.id;
  const u2Id = u2.body.user.id;

  // U1 inserts two todos; owner_id is auto-stamped from the session (never sent).
  const ins1 = await callJson(
    appdbPOST,
    req("/api/appdb", { host: HOST, cookie: cookie1, body: { table: "todos", op: "insert", values: { title: "U1 buy milk" } } }),
  );
  ok(
    "U1 insert stamps owner_id from the session",
    ins1.status === 200 && ins1.body.rows?.[0]?.owner_id === u1Id,
  );
  await callJson(
    appdbPOST,
    req("/api/appdb", { host: HOST, cookie: cookie1, body: { table: "todos", op: "insert", values: { title: "U1 walk dog" } } }),
  );
  // U2 inserts one.
  const ins2 = await callJson(
    appdbPOST,
    req("/api/appdb", { host: HOST, cookie: cookie2, body: { table: "todos", op: "insert", values: { title: "U2 pay rent" } } }),
  );
  ok("U2 insert stamps its own owner_id", ins2.body.rows?.[0]?.owner_id === u2Id);

  // Selects are RLS-scoped per end-user.
  const sel1 = await callJson(
    appdbPOST,
    req("/api/appdb", { host: HOST, cookie: cookie1, body: { table: "todos", op: "select" } }),
  );
  ok("U1 sees exactly its own 2 rows", sel1.body.rows?.length === 2 && sel1.body.rows.every((r) => r.owner_id === u1Id));
  const sel2 = await callJson(
    appdbPOST,
    req("/api/appdb", { host: HOST, cookie: cookie2, body: { table: "todos", op: "select" } }),
  );
  ok("U2 sees exactly its own 1 row", sel2.body.rows?.length === 1 && sel2.body.rows[0].owner_id === u2Id);
  // Anonymous (no cookie) sees nothing.
  const selAnon = await callJson(
    appdbPOST,
    req("/api/appdb", { host: HOST, body: { table: "todos", op: "select" } }),
  );
  ok("anonymous caller sees 0 rows", selAnon.body.rows?.length === 0);

  // U2's blanket UPDATE cannot touch U1's rows (RLS confines it).
  await callJson(
    appdbPOST,
    req("/api/appdb", { host: HOST, cookie: cookie2, body: { table: "todos", op: "update", values: { title: "HACKED" } } }),
  );
  const sel1After = await callJson(
    appdbPOST,
    req("/api/appdb", { host: HOST, cookie: cookie1, body: { table: "todos", op: "select" } }),
  );
  ok(
    "U2's blanket UPDATE left U1's rows untouched",
    sel1After.body.rows?.length === 2 && sel1After.body.rows.every((r) => r.title.startsWith("U1 ")),
  );

  // U1 deletes its own rows; U2's row survives.
  const del1 = await callJson(
    appdbPOST,
    req("/api/appdb", { host: HOST, cookie: cookie1, body: { table: "todos", op: "delete" } }),
  );
  ok("U1 delete removed exactly its 2 rows", del1.body.rows?.length === 2);
  const sel2Survive = await callJson(
    appdbPOST,
    req("/api/appdb", { host: HOST, cookie: cookie2, body: { table: "todos", op: "select" } }),
  );
  ok("U2's row survived U1's delete", sel2Survive.body.rows?.length === 1);

  console.log("\n# Serve route injects the window.artefacts SDK on the published app");
  {
    const res = await serveGET(req("/", { host: HOST, method: "GET", appPath: "/" }));
    const html = await res.text();
    ok("published index.html served (200)", res.status === 200);
    ok("window.__ARTEFACTS__ bootstrap injected", html.includes("window.__ARTEFACTS__"));
    ok("window.artefacts DB/auth SDK injected", html.includes("window.artefacts"));
  }

  console.log("\n# A published project WITHOUT a database rejects data calls");
  {
    const [proj2] = await db
      .insert(projects)
      .values({ userId: owner.id, name: "Plain Site" })
      .returning();
    await db.insert(files).values({
      projectId: proj2.id,
      path: "/index.html",
      content: "<!doctype html><html><head></head><body>Plain</body></html>",
    });
    const { slug: slug2 } = await publishProject(proj2.id, owner.id);
    const r = await callJson(
      appdbPOST,
      req("/api/appdb", { host: `${slug2}.${APPS_DOMAIN}`, body: { table: "x", op: "select" } }),
    );
    ok("no-DB published app → 400 (keine Datenbank)", r.status === 400);
    const serveRes = await serveGET(req("/", { host: `${slug2}.${APPS_DOMAIN}`, method: "GET", appPath: "/" }));
    const html = await serveRes.text();
    ok("no-DB published app does NOT inject the SDK", !html.includes("window.artefacts"));
  }

  console.log(`\nResult: ${pass} passed, ${fail} failed\n`);
  await pool.end().catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("\nE2E crashed:", e);
  await pool.end().catch(() => {});
  process.exit(3);
});
