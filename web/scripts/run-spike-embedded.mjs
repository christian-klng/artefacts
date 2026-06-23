// Boots a real (embedded) Postgres with roles + RLS, runs the security spike
// against it, then tears everything down. No Docker/brew needed.
//
//   node scripts/run-spike-embedded.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5433;
const USER = "postgres";
const PASS = "spike";

const dataDir = await mkdtemp(join(tmpdir(), "spike-pg-"));
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
  code = await new Promise((resolve) => {
    const child = spawn("node", [join(here, "security-spike.mjs"), url], {
      stdio: "inherit",
    });
    child.on("exit", (c) => resolve(c ?? 1));
  });
} catch (e) {
  console.error("Runner error:", e);
} finally {
  await pg.stop().catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
process.exit(code);
