// End-to-end check for Phase 1 subdomain serving.
// Boots a real (embedded) Postgres, seeds a project's /index.html, starts the
// built Next app, then hits /serve with spoofed Host headers + preview tokens
// to confirm the gating. No Docker needed.
//
//   npm run build && node scripts/verify-phase1.mjs

import { spawn, execSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import EmbeddedPostgres from "embedded-postgres";

const PORT = 5433;
const APP_PORT = 3000;
const SECRET = "phase1-verify-secret";
const APPS_DOMAIN = "apps.localhost:3000";
const PID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_PID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const INDEX_MARKER = "<h1>HELLO FROM VFS</h1>";

process.env.AUTH_SECRET = SECRET;
const { signPreviewToken } = await import("../lib/preview-token.ts");

let pass = 0, fail = 0;
const ok = (l, c) => { if (c) pass++; else fail++; console.log((c ? "PASS" : "FAIL"), l); };

function curlStatus(host, path) {
  return execSync(
    `curl -s -o /dev/null -w "%{http_code}" -H "Host: ${host}" "http://127.0.0.1:${APP_PORT}${path}"`,
  ).toString().trim();
}
function curlBody(host, path) {
  return execSync(
    `curl -s -H "Host: ${host}" "http://127.0.0.1:${APP_PORT}${path}"`,
  ).toString();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dataDir = await mkdtemp(join(tmpdir(), "phase1-pg-"));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: "postgres", password: "spike", port: PORT, persistent: false,
});
let next;
try {
  console.log("# Booting Postgres + seeding");
  await pg.initialise();
  await pg.start();
  const dbUrl = `postgresql://postgres:spike@127.0.0.1:${PORT}/postgres`;
  const pool = new Pool({ connectionString: dbUrl });
  // Minimal `file` table (what readFile() touches) + one seeded index.html.
  await pool.query(`CREATE TABLE "file" (
    "id" uuid primary key default gen_random_uuid(),
    "projectId" uuid not null,
    "path" text not null,
    "content" text not null default '',
    "updatedAt" timestamptz not null default now()
  )`);
  await pool.query(
    `INSERT INTO "file" ("projectId","path","content") VALUES ($1,$2,$3)`,
    [PID, "/index.html", `<!doctype html><html><head><title>t</title></head><body>${INDEX_MARKER}</body></html>`],
  );
  await pool.end();

  console.log("# Starting built Next app");
  next = spawn("./node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    env: { ...process.env, DATABASE_URL: dbUrl, AUTH_SECRET: SECRET, APPS_DOMAIN },
    stdio: "ignore",
  });
  // Wait until the server answers.
  let up = false;
  for (let i = 0; i < 60; i++) {
    try { await fetch(`http://127.0.0.1:${APP_PORT}/login`); up = true; break; }
    catch { await sleep(1000); }
  }
  if (!up) throw new Error("Next app never came up");

  console.log("\n# Serve-route gating");
  const host = `preview-${PID}.${APPS_DOMAIN}`;
  const goodToken = signPreviewToken(PID);
  const otherToken = signPreviewToken(OTHER_PID);

  ok("valid host + valid token -> 200", curlStatus(host, `/?pt=${goodToken}`) === "200");
  const body = curlBody(host, `/?pt=${goodToken}`);
  ok("served body is the VFS index.html", body.includes(INDEX_MARKER));
  ok("served body has injected __ARTEFACTS__ config", body.includes("__ARTEFACTS__") && body.includes(PID));
  ok("missing token -> 403", curlStatus(host, `/`) === "403");
  ok("another project's token -> 403", curlStatus(host, `/?pt=${otherToken}`) === "403");
  ok("tampered token -> 403", curlStatus(host, `/?pt=${goodToken}xx`) === "403");
  ok("builder/main domain hitting /serve -> 404", curlStatus(`localhost:${APP_PORT}`, `/serve?pt=${goodToken}`) === "404");
  ok("unknown project (no index.html) -> 404", curlStatus(`preview-${OTHER_PID}.${APPS_DOMAIN}`, `/?pt=${otherToken}`) === "404");
} catch (e) {
  console.error("Harness error:", e);
  fail++;
} finally {
  if (next) next.kill("SIGKILL");
  await pg.stop().catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
