// Canary for live-progress streaming through the Agent SDK (see lib/agent/run.ts).
//
// The builder runs query() with `includePartialMessages: true` and turns the raw
// `stream_event` messages into live UI progress (assistant text deltas + tool
// input generation as "write_file /index.html · 12 kB"). That only works if the
// transport actually delivers fine-grained deltas:
//
//   1. run one SDK query with a no-op MCP write_file tool (same shape as the
//      builder's mcp__vfs__write_file) and a prompt that forces a ~1.5 kB input,
//   2. count stream_event deltas (text_delta / input_json_delta) and their
//      spread over time — a gateway that buffers the response would deliver
//      everything in one burst (UI degrades to today's block-at-once behavior),
//   3. replay the agent route's dedup bookkeeping (streamedTextChars) and check
//      deltas + committed remainder assemble EXACTLY the committed text — the
//      invariant that keeps chat text from doubling.
//
//   npm run canary:partial        (or: node scripts/partial-stream-canary.mjs)
//   flags: --model=<id>  --direct  --verbose
//
// Transport: with CORTECS_API_KEY set it mirrors run.ts (cortecs base URL, tier
// env, thinking off). --direct (or no cortecs key) runs against api.anthropic.com
// with ANTHROPIC_API_KEY on a cheap Haiku — that mode proves the SDK mechanics,
// not the gateway. Run it WITH the cortecs key (e.g. on the server) to answer
// "does cortecs forward deltas promptly?".
//
// Exit codes: 0 = deltas flow (live progress works), 1 = no/buffered deltas,
// 2 = inconclusive / config error.
//
// Config from env, with web/.env.local, web/.env and the repo-root .env as
// non-overriding fallbacks (same loader as the thinking canary). NOTE: DB-backed
// admin overrides (app_setting) are NOT read here — pass --model=… if pinned.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));

// --- .env fallbacks (never override already-set env vars) -------------------

function loadEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
for (const rel of ["../.env.local", "../.env", "../../.env"]) {
  loadEnvFile(resolve(here, rel));
}

// --- config ------------------------------------------------------------------

const args = new Map(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const i = a.indexOf("=");
      return i === -1 ? [a.slice(2), "true"] : [a.slice(2, i), a.slice(i + 1)];
    }),
);
const verbose = args.has("verbose");

const cortecsKey = process.env.CORTECS_API_KEY ?? null;
const direct = args.has("direct") || !cortecsKey;
if (direct && !process.env.ANTHROPIC_API_KEY) {
  console.error(
    "FEHLER: Weder CORTECS_API_KEY noch ANTHROPIC_API_KEY gesetzt (env oder web/.env.local).",
  );
  process.exit(2);
}

// Direct mode is only about SDK mechanics — cheapest Claude is fine. Cortecs
// mode mirrors the builder's default catalog id (NOT Anthropic's).
const model =
  args.get("model") ??
  (direct
    ? "claude-haiku-4-5-20251001"
    : (process.env.CORTECS_BUILD_MODEL ?? "claude-opus4-8"));
const cortecsBase = (process.env.CORTECS_ANTHROPIC_BASE_URL ?? "https://api.cortecs.ai")
  .replace(/\/+$/, "")
  .replace(/\/v1$/i, "");

// Same gateway env the builder hands the spawned CLI (run.ts), minus DB lookups.
const gatewayEnv = direct
  ? {}
  : {
      ANTHROPIC_BASE_URL: cortecsBase,
      ANTHROPIC_AUTH_TOKEN: cortecsKey,
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
      ANTHROPIC_CUSTOM_MODEL_OPTION: model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
      CLAUDE_CODE_DISABLE_THINKING: "1",
    };

// --- the probe -----------------------------------------------------------------

// No-op stand-in for the builder's mcp__vfs__write_file — records what streamed.
const written = [];
const vfs = createSdkMcpServer({
  name: "vfs",
  version: "0.0.1",
  tools: [
    tool(
      "write_file",
      "Write a file to the project.",
      { path: z.string(), content: z.string() },
      async ({ path, content }) => {
        written.push({ path, chars: content.length });
        return { content: [{ type: "text", text: `Wrote ${path}` }] };
      },
    ),
  ],
});

const PROMPT =
  "Sag zuerst in EINEM kurzen Satz, was du gleich tust. Dann schreibe mit dem " +
  "write_file-Tool eine Datei /index.html mit einer einfachen HTML-Seite über " +
  "Leuchttürme (~1500 Zeichen, Inline-CSS). Kein weiterer Text danach.";

console.log("Partial-Stream-Canary (includePartialMessages)");
console.log(`  Transport: ${direct ? "direkt api.anthropic.com (nur SDK-Mechanik)" : `cortecs (${cortecsBase})`}`);
console.log(`  Modell:    ${model}`);

const ac = new AbortController();
const killer = setTimeout(() => ac.abort(), 240_000);
killer.unref?.();

// Stats gathered from the stream.
let streamEvents = 0;
let textDeltas = 0;
let textDeltaChars = 0;
let toolBlocks = 0;
let inputDeltas = 0;
let inputDeltaChars = 0;
let firstInputDeltaAt = null;
let lastInputDeltaAt = null;
let resultSubtype = null;

// Replay of the agent route's dedup bookkeeping: deltas count into
// streamedTextChars; the committed block only forwards the remainder. The
// UI-visible text is deltas + remainders and must equal the committed text.
let streamedTextChars = 0;
let uiText = "";
let committedText = "";

try {
  const run = query({
    prompt: PROMPT,
    options: {
      model,
      mcpServers: { vfs },
      allowedTools: ["mcp__vfs__write_file"],
      permissionMode: "bypassPermissions",
      settingSources: [],
      maxTurns: 6,
      includePartialMessages: true,
      abortController: ac,
      env: { ...process.env, ...gatewayEnv },
    },
  });

  for await (const msg of run) {
    if (msg.type === "stream_event") {
      if (msg.parent_tool_use_id) continue;
      streamEvents++;
      const ev = msg.event;
      if (ev.type === "message_start") streamedTextChars = 0;
      else if (ev.type === "content_block_start" && ev.content_block.type === "tool_use") {
        toolBlocks++;
        if (verbose) console.log(`  [stream] tool_use-Block startet: ${ev.content_block.name}`);
      } else if (ev.type === "content_block_delta") {
        if (ev.delta.type === "text_delta") {
          textDeltas++;
          textDeltaChars += ev.delta.text.length;
          streamedTextChars += ev.delta.text.length;
          uiText += ev.delta.text;
        } else if (ev.delta.type === "input_json_delta") {
          inputDeltas++;
          inputDeltaChars += ev.delta.partial_json.length;
          firstInputDeltaAt ??= Date.now();
          lastInputDeltaAt = Date.now();
        }
      }
    } else if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) {
          committedText += block.text;
          const alreadyStreamed = Math.min(streamedTextChars, block.text.length);
          streamedTextChars -= alreadyStreamed;
          uiText += block.text.slice(alreadyStreamed);
        }
      }
      streamedTextChars = 0;
    } else if (msg.type === "result") {
      resultSubtype = msg.subtype;
    }
  }
} catch (err) {
  console.error(`\n⚠️  SDK-Lauf fehlgeschlagen: ${err?.message ?? err}`);
  console.error("   → Keine Aussage möglich (Transport-/Config-Problem).");
  process.exit(2);
} finally {
  clearTimeout(killer);
}

// --- verdict ---------------------------------------------------------------------

const spreadMs =
  firstInputDeltaAt && lastInputDeltaAt ? lastInputDeltaAt - firstInputDeltaAt : 0;

console.log(`\n  result:            ${resultSubtype}`);
console.log(`  stream_events:     ${streamEvents}`);
console.log(`  text_deltas:       ${textDeltas} (${textDeltaChars} Z.)`);
console.log(`  tool_use-Blöcke:   ${toolBlocks}, input_json_deltas: ${inputDeltas} (${inputDeltaChars} Z., Spanne ${spreadMs} ms)`);
console.log(`  Tool ausgeführt:   ${written.map((w) => `${w.path} (${w.chars} Z.)`).join(", ") || "NEIN"}`);

console.log("\n================================================================");
if (resultSubtype !== "success") {
  console.log(`⚠️  Lauf endete mit "${resultSubtype}" — erneut versuchen.`);
  process.exit(2);
}
if (streamEvents === 0) {
  console.log("❌ Keine stream_events erhalten — includePartialMessages wirkt nicht.");
  console.log("   → Live-Fortschritt bleibt aus; UI fällt auf Block-Verhalten zurück.");
  process.exit(1);
}
if (uiText !== committedText) {
  console.log("❌ Dedup-Invariante verletzt: Delta-Text + Rest ≠ committeter Text.");
  console.log(`   UI ${uiText.length} Z. vs. committed ${committedText.length} Z. — Chat würde Text doppeln/verlieren.`);
  process.exit(1);
}
if (toolBlocks === 0 || inputDeltas < 3) {
  console.log("❌ Tool-Input kam nicht als Delta-Strom an (weniger als 3 input_json_deltas).");
  console.log("   → Der Transport buffert; Fortschrittszähler bliebe stumm.");
  process.exit(1);
}
console.log("✅ Deltas fließen: Live-Text + Tool-Fortschritt funktionieren über diesen Transport.");
console.log(`   Dedup sauber (${committedText.length} Z. Text exakt einmal), Input-Strom über ${spreadMs} ms.`);
if (spreadMs < 200 && inputDeltaChars > 1000) {
  console.log("   ⚠️  Auffällig: alle Input-Deltas kamen quasi gleichzeitig — möglich, dass der Gateway puffert. Mit größerem Input erneut prüfen.");
}
process.exit(0);
