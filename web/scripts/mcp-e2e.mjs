// End-to-end test of the external MCP editing interface (lib/mcp/* + the real
// app/api/mcp route handler). Proves the "an operator edits a user's app through
// their own AI, without spending the user's credit or touching their chat" story:
//
//   - the DEV_API_SECRET bearer gate (no/wrong key → 401);
//   - the pinned-project contract (missing ?app → 400, unknown app → 404);
//   - the MCP handshake + tools/list surface (the 7 tools);
//   - read_file / write_file / edit_file against the real VFS;
//   - the maintenance hooks: an 'admin' pre-edit backup exists, and the <title>
//     is adopted as the project name (auto-name) — the same post-turn work the
//     agent route does;
//   - the audit trail: admin_edit_log rows are written;
//   - the KEY privacy invariant: NO `message` (chat) rows are created.
//
// Run via scripts/run-mcp-e2e.mjs (boots embedded Postgres + hooks).

import { eq } from "drizzle-orm";
import { db } from "../lib/db/index.ts";
import {
  users,
  projects,
  files,
  messages,
  projectBackups,
  adminEditLog,
} from "../lib/db/schema.ts";
import { readFile } from "../lib/projects.ts";
import { POST as mcpPOST } from "../app/api/mcp/route.ts";

const SECRET = process.env.DEV_API_SECRET;

// --- tiny assertion harness (same shape as publish-db-e2e.mjs) --------------
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

// --- MCP JSON-RPC plumbing against the real route handler -------------------
let rpcId = 0;
async function mcp(method, params, opts = {}) {
  const { app = PROJECT_ID, bearer = SECRET, actor } = opts;
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (bearer !== null) headers["authorization"] = `Bearer ${bearer}`;
  if (actor) headers["x-actor"] = actor;
  const qs = app === null ? "" : `?app=${encodeURIComponent(app)}`;
  const request = new Request(`http://builder.local/api/mcp${qs}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const res = await mcpPOST(request);
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON (e.g. the plain 401 body) — leave body null
  }
  return { status: res.status, body };
}

async function callTool(name, args, opts) {
  const { status, body } = await mcp(
    "tools/call",
    { name, arguments: args ?? {} },
    opts,
  );
  const text = (body?.result?.content ?? [])
    .map((c) => c.text ?? "")
    .join("");
  return { status, isError: body?.result?.isError === true, text };
}

const INIT = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "mcp-e2e", version: "0" },
};

let PROJECT_ID = null;

async function main() {
  console.log("\n# Seed: user + project (default name) + VFS files");
  const [owner] = await db
    .insert(users)
    .values({ email: "owner@example.com", name: "Owner" })
    .returning();
  // A DEFAULT name so the write_file /index.html hook can adopt the <title>.
  const [proj] = await db
    .insert(projects)
    .values({ userId: owner.id, name: "Untitled app" })
    .returning();
  PROJECT_ID = proj.id;
  await db.insert(files).values([
    {
      projectId: proj.id,
      path: "/index.html",
      content:
        "<!doctype html><html lang=\"en\"><head><title>Seed Title</title></head><body><h1>Hi</h1></body></html>",
    },
    { projectId: proj.id, path: "/styles.css", content: "body{color:#111}" },
    {
      projectId: proj.id,
      path: "/DESIGN.md",
      content: "# Design DNA\nEpoch: swiss-international. Font: Archivo.",
    },
    {
      projectId: proj.id,
      path: "/CONCEPT.md",
      content: "# Concept\nSite type: web-app\nA demo app.",
    },
  ]);
  console.log("  project", proj.id);

  console.log("\n# Auth gate");
  ok("no bearer → 401", (await mcp("initialize", INIT, { bearer: null })).status === 401);
  ok("wrong bearer → 401", (await mcp("initialize", INIT, { bearer: "nope" })).status === 401);

  console.log("\n# Pinned-project contract");
  ok("missing ?app → 400", (await mcp("initialize", INIT, { app: null })).status === 400);
  ok(
    "unknown app → 404",
    (await mcp("initialize", INIT, { app: "00000000-0000-0000-0000-000000000000" }))
      .status === 404,
  );
  ok("malformed app id → 404", (await mcp("initialize", INIT, { app: "not-a-uuid" })).status === 404);

  console.log("\n# MCP handshake + tool surface");
  const init = await mcp("initialize", INIT);
  ok(
    "initialize → 200 with server name",
    init.status === 200 && init.body?.result?.serverInfo?.name === "artefacts-app",
  );
  const list = await mcp("tools/list", {});
  const toolNames = (list.body?.result?.tools ?? []).map((t) => t.name).sort();
  for (const t of [
    "get_build_guidelines",
    "get_project",
    "list_files",
    "read_file",
    "write_file",
    "edit_file",
    "delete_file",
  ]) {
    ok(`tools/list exposes ${t}`, toolNames.includes(t));
  }

  console.log("\n# Read-only context tools (the builder 'hints')");
  const guide = await callTool("get_build_guidelines", {});
  ok(
    "get_build_guidelines returns the builder guidance",
    !guide.isError &&
      guide.text.includes("external editing interface") &&
      guide.text.includes("Design DNA"),
  );
  const proout = await callTool("get_project", {});
  ok(
    "get_project surfaces meta + internal DESIGN.md",
    !proout.isError &&
      proout.text.includes("swiss-international") &&
      proout.text.includes("/index.html"),
  );

  console.log("\n# read_file");
  const rd = await callTool("read_file", { path: "/index.html" });
  ok("read_file returns the seeded content", rd.text.includes("Seed Title"));
  const rdMissing = await callTool("read_file", { path: "/nope.txt" });
  ok("read_file on a missing file → tool error", rdMissing.isError);

  console.log("\n# write_file (new file)");
  const wr = await callTool("write_file", {
    path: "/app.js",
    content: "console.log('hi')",
  });
  ok("write_file ok", !wr.isError && wr.text.startsWith("Wrote /app.js"));
  ok(
    "written file is in the VFS",
    (await readFile(proj.id, "/app.js")) === "console.log('hi')",
  );

  console.log("\n# write_file /index.html triggers auto-name from <title>");
  await callTool(
    "write_file",
    {
      path: "/index.html",
      content:
        "<!doctype html><html lang=\"en\"><head><title>Renamed App</title></head><body><h1>Hi</h1></body></html>",
    },
    { actor: "e2e-operator" }, // X-Actor header → audit attribution
  );
  const renamed = await db.query.projects.findFirst({
    where: eq(projects.id, proj.id),
  });
  ok("project auto-named from <title>", renamed?.name === "Renamed App");

  console.log("\n# edit_file");
  const ed = await callTool("edit_file", {
    path: "/styles.css",
    old_string: "#111",
    new_string: "#222",
  });
  ok("edit_file ok", !ed.isError && ed.text.startsWith("Edited /styles.css"));
  ok(
    "edit applied in the VFS",
    (await readFile(proj.id, "/styles.css")) === "body{color:#222}",
  );
  const edBad = await callTool("edit_file", {
    path: "/styles.css",
    old_string: "does-not-exist",
    new_string: "x",
  });
  ok("edit_file with no match → tool error", edBad.isError);

  console.log("\n# delete_file");
  const del = await callTool("delete_file", { path: "/app.js" });
  ok("delete_file ok", !del.isError);
  ok("file removed from the VFS", (await readFile(proj.id, "/app.js")) === null);

  console.log("\n# Maintenance hooks + audit + privacy invariant");
  const backups = await db
    .select()
    .from(projectBackups)
    .where(eq(projectBackups.projectId, proj.id));
  ok(
    "a pre-edit 'admin' backup was created",
    backups.some((b) => b.kind === "admin"),
  );
  const audit = await db
    .select()
    .from(adminEditLog)
    .where(eq(adminEditLog.projectId, proj.id));
  ok("audit rows written for the mutations", audit.length >= 4);
  ok(
    "audit records the X-Actor label",
    audit.some((a) => a.actor === "e2e-operator"),
  );
  ok(
    "audit records write/edit/delete actions",
    ["write", "edit", "delete"].every((a) => audit.some((r) => r.action === a)),
  );
  const chat = await db
    .select()
    .from(messages)
    .where(eq(messages.projectId, proj.id));
  ok("NO chat/message rows were created (not in the user's chat)", chat.length === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import("../lib/db/index.ts");
    await pool.end().catch(() => {});
  });
