// Boots a real (embedded) Postgres, pushes the Drizzle schema, then runs the
// publish-with-database end-to-end test against it under the module-resolution
// hooks that let the standalone harness import the real Next route handlers.
// No Docker, no Next server. Tears everything down afterwards.
//
//   node scripts/run-publish-db-e2e.mjs   (or: npm run e2e:publish-db)

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = dirname(here);
const PORT = 5434; // security-spike uses 5433; keep them non-overlapping.
const USER = "postgres";
const PASS = "e2e";
const AUTH_SECRET = "publish-db-e2e-secret";
const APPS_DOMAIN = "apps.localhost";

function run(cmd, args, extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: WEB,
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.on("exit", (c) => resolve(c ?? 1));
  });
}

const dataDir = await mkdtemp(join(tmpdir(), "publish-db-e2e-pg-"));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASS,
  port: PORT,
  persistent: false,
});

let code = 1;
try {
  console.log("Starting embedded Postgres in", dataDir, "...");
  await pg.initialise();
  await pg.start();
  console.log("Postgres up on", PORT);

  const url = `postgresql://${USER}:${PASS}@127.0.0.1:${PORT}/postgres`;
  const env = {
    DATABASE_URL: url,
    AUTH_SECRET,
    APPS_DOMAIN,
    E2E_WEB_DIR: WEB,
  };

  console.log("\nPushing Drizzle schema ...");
  const pushCode = await run(
    join(WEB, "node_modules/.bin/drizzle-kit"),
    ["push", "--force"],
    env,
  );
  if (pushCode !== 0) throw new Error(`drizzle-kit push failed (${pushCode})`);

  console.log("\nRunning publish-with-DB E2E ...");
  code = await run(
    "node",
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--import",
      join(here, "e2e-register.mjs"),
      join(here, "publish-db-e2e.mjs"),
    ],
    env,
  );
} catch (e) {
  console.error("Runner error:", e);
} finally {
  await pg.stop().catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
process.exit(code);
