// Canary for the cortecs thinking-signature gateway bug (see lib/agent/run.ts).
//
// cortecs' Anthropic-compatible endpoint has been returning extended-thinking
// blocks with an EMPTY `signature`; echoing such a block back on the next turn
// is rejected upstream with "API Error: 400". Claude Code therefore runs with
// CLAUDE_CODE_DISABLE_THINKING=1. This script probes whether cortecs now passes
// signatures through so the flag can be removed:
//
//   1. POST /v1/messages with adaptive thinking + a trivial tool-use scenario.
//   2. Inspect the returned thinking blocks for a non-empty `signature`.
//   3. Echo the assistant turn (thinking + tool_use, verbatim) back with a
//      tool_result — the exact request shape that used to 400.
//
//   npm run canary:thinking        (or: node scripts/cortecs-thinking-canary.mjs)
//   flags: --model=<cortecs id>  --base=<url>  --auth=bearer|x-api-key  --verbose
//
// --auth defaults to "bearer" (what run.ts hands the CLI via ANTHROPIC_AUTH_TOKEN).
// For a reference run against api.anthropic.com (which must pass — it proves the
// canary itself), use: CORTECS_API_KEY=$ANTHROPIC_API_KEY node scripts/… \
//   --base=https://api.anthropic.com --model=claude-opus-4-8 --auth=x-api-key
//
// Exit codes: 0 = fix confirmed, 1 = still broken, 2 = inconclusive / config error.
//
// Config comes from env, with web/.env.local, web/.env and the repo-root .env
// as non-overriding fallbacks:
//   CORTECS_API_KEY              required (secret, env-only — same as the app)
//   CORTECS_BUILD_MODEL          cortecs CATALOG id (default "claude-opus4-8" —
//                                NOT Anthropic's "claude-opus-4-8"; verify at
//                                GET https://api.cortecs.ai/v1/models)
//   CORTECS_ANTHROPIC_BASE_URL   default https://api.cortecs.ai
//
// NOTE: unlike lib/settings.ts this script does NOT read DB-backed admin
// overrides (app_setting) — if the admin app pins a different build model,
// pass --model=… explicitly.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const apiKey = process.env.CORTECS_API_KEY;
if (!apiKey) {
  console.error(
    "FEHLER: CORTECS_API_KEY ist nicht gesetzt (env oder web/.env.local).",
  );
  process.exit(2);
}

const model = args.get("model") ?? process.env.CORTECS_BUILD_MODEL ?? "claude-opus4-8";
// Same normalization as cortecsAnthropicBaseUrl(): no trailing slash, no /v1.
const base = (
  args.get("base") ?? process.env.CORTECS_ANTHROPIC_BASE_URL ?? "https://api.cortecs.ai"
)
  .replace(/\/+$/, "")
  .replace(/\/v1$/i, "");
const url = `${base}/v1/messages`;
const authMode = args.get("auth") ?? "bearer";

// --- request plumbing ----------------------------------------------------------

async function messagesRequest(body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Default mirrors the builder: run.ts hands the key to Claude Code as
        // ANTHROPIC_AUTH_TOKEN, which becomes an Authorization: Bearer header.
        // (api.anthropic.com wants API keys as x-api-key instead → --auth.)
        ...(authMode === "x-api-key"
          ? { "x-api-key": apiKey }
          : { authorization: `Bearer ${apiKey}` }),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON error body */
    }
    if (verbose) console.log(`\n[verbose] HTTP ${res.status}\n${text}\n`);
    return { status: res.status, ok: res.ok, json, text };
  } catch (err) {
    return { status: 0, ok: false, json: null, text: String(err?.message ?? err) };
  }
}

const head = (s, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

function fatal(msg, res) {
  console.error(`\n⚠️  ${msg}`);
  if (res) console.error(`   HTTP ${res.status}: ${head(res.text)}`);
  console.error("   → Keine Aussage zum Signatur-Bug möglich (Config-/Transportproblem).");
  process.exit(2);
}

// --- the probe -----------------------------------------------------------------

const TOOLS = [
  {
    name: "check_answer",
    description:
      "Prüft ein berechnetes Ergebnis. Rufe dieses Tool genau einmal mit deinem Ergebnis auf.",
    input_schema: {
      type: "object",
      properties: {
        result: { type: "integer", description: "Das berechnete Ergebnis" },
      },
      required: ["result"],
    },
  },
];
// Mental arithmetic reliably triggers an adaptive-thinking block before the
// tool call — exactly the content shape that used to break on echo.
const USER_PROMPT =
  "Berechne 27 * 453 Schritt für Schritt im Kopf und übergib das Ergebnis dann per Tool-Aufruf an check_answer.";

// The default build model (opus4-8) only accepts adaptive thinking; older
// models need budget_tokens. Try in order, skipping configs the API 400s.
const THINKING_CONFIGS = [
  { label: 'adaptive (display: "summarized")', value: { type: "adaptive", display: "summarized" } },
  { label: "adaptive", value: { type: "adaptive" } },
  { label: "enabled + budget_tokens (Prä-4.6-Fallback)", value: { type: "enabled", budget_tokens: 4096 } },
];

function baseBody(thinking) {
  return { model, max_tokens: 4096, thinking, tools: TOOLS };
}

function summarizeContent(content) {
  return content
    .map((b) => {
      if (b.type === "thinking") {
        const sigLen = typeof b.signature === "string" ? b.signature.trim().length : -1;
        return `thinking(text: ${(b.thinking ?? "").length} Z., signature: ${
          sigLen > 0 ? `${sigLen} Z.` : sigLen === 0 ? "LEER ❌" : "FEHLT ❌"
        })`;
      }
      if (b.type === "redacted_thinking") return "redacted_thinking";
      if (b.type === "tool_use") return `tool_use(${b.name})`;
      if (b.type === "text") return `text(${b.text.length} Z.)`;
      return b.type;
    })
    .join(", ");
}

console.log("Cortecs Thinking-Signatur-Canary");
console.log(`  Endpoint: ${url}`);
console.log(`  Modell:   ${model} (cortecs-Katalog-ID; DB-Override im Admin wird hier NICHT gelesen — ggf. --model=…)`);

// Turn 1 — find an accepted thinking config, then make sure we actually got a
// thinking block (adaptive means the model MAY skip thinking on easy prompts).
let cfg = null;
let turn1 = null;
for (const candidate of THINKING_CONFIGS) {
  console.log(`\n→ Turn 1: /v1/messages mit thinking = ${candidate.label} …`);
  const res = await messagesRequest({
    ...baseBody(candidate.value),
    messages: [{ role: "user", content: USER_PROMPT }],
  });
  if (res.status === 400) {
    console.log(`   400 für diese thinking-Config — nächster Versuch. (${head(res.text, 160)})`);
    continue;
  }
  if (!res.ok || !Array.isArray(res.json?.content)) {
    fatal("Turn 1 fehlgeschlagen (kein 400 auf die thinking-Config, sondern Transport-/Auth-Fehler).", res);
  }
  cfg = candidate;
  turn1 = res;
  break;
}
if (!cfg) {
  fatal("Keine thinking-Config wurde akzeptiert — Modell-ID prüfen (GET /v1/models auf cortecs).");
}

const hasThinking = (c) => c.some((b) => b.type === "thinking" || b.type === "redacted_thinking");
for (let attempt = 2; attempt <= 3 && !hasThinking(turn1.json.content); attempt++) {
  console.log(`   Antwort enthielt keinen Thinking-Block — erneuter Versuch (${attempt}/3) …`);
  const res = await messagesRequest({
    ...baseBody(cfg.value),
    messages: [{ role: "user", content: USER_PROMPT }],
  });
  if (!res.ok || !Array.isArray(res.json?.content)) fatal("Wiederholung von Turn 1 fehlgeschlagen.", res);
  turn1 = res;
}

const content = turn1.json.content;
console.log(`   stop_reason: ${turn1.json.stop_reason}`);
console.log(`   content:     ${summarizeContent(content)}`);

if (!hasThinking(content)) {
  console.log(
    "\n⚠️  Das Modell hat in 3 Versuchen kein Thinking emittiert — keine Aussage zum Signatur-Bug möglich.",
  );
  console.log("   → Erneut ausführen; adaptives Thinking ist nicht deterministisch.");
  process.exit(2);
}

const emptySignatures = content.filter(
  (b) => b.type === "thinking" && !(typeof b.signature === "string" && b.signature.trim().length > 0),
);

// Turn 2 — echo the assistant content VERBATIM (thinking blocks included) plus
// the tool_result. This is the request the upstream used to reject with 400.
const toolUses = content.filter((b) => b.type === "tool_use");
const followUp =
  toolUses.length > 0
    ? {
        role: "user",
        content: toolUses.map((t) => ({
          type: "tool_result",
          tool_use_id: t.id,
          content: "Korrekt.",
        })),
      }
    : { role: "user", content: "Danke. Antworte nur mit: OK" };

console.log(`\n→ Turn 2: Echo des Assistant-Turns (inkl. Thinking-Block) + ${toolUses.length > 0 ? "tool_result" : "Follow-up"} …`);
let turn2 = await messagesRequest({
  ...baseBody(cfg.value),
  messages: [
    { role: "user", content: USER_PROMPT },
    { role: "assistant", content },
    followUp,
  ],
});
if (turn2.status >= 500 || turn2.status === 0) {
  console.log(`   Transient (${turn2.status || "Netzwerk"}) — ein Wiederholungsversuch …`);
  turn2 = await messagesRequest({
    ...baseBody(cfg.value),
    messages: [
      { role: "user", content: USER_PROMPT },
      { role: "assistant", content },
      followUp,
    ],
  });
}
if (turn2.ok) {
  console.log(`   HTTP ${turn2.status}, stop_reason: ${turn2.json?.stop_reason}`);
  if (Array.isArray(turn2.json?.content)) console.log(`   content:     ${summarizeContent(turn2.json.content)}`);
} else {
  console.log(`   HTTP ${turn2.status}: ${head(turn2.text)}`);
}

// --- verdict ---------------------------------------------------------------------

console.log("\n================================================================");
if (emptySignatures.length > 0) {
  console.log("❌ Cortecs mangelt die Thinking-Signatur weiterhin:");
  console.log(`   ${emptySignatures.length} Thinking-Block/Blöcke mit leerer/fehlender \`signature\` in Turn 1.`);
  console.log(
    turn2.status === 400
      ? "   Turn-2-Echo wurde erwartungsgemäß mit 400 abgelehnt."
      : `   (Turn-2-Echo endete mit HTTP ${turn2.status}.)`,
  );
  console.log("   → CLAUDE_CODE_DISABLE_THINKING in web/lib/agent/run.ts muss bleiben.");
  process.exit(1);
}
if (turn2.ok) {
  console.log("✅ Fix ist da — CLAUDE_CODE_DISABLE_THINKING in web/lib/agent/run.ts kann entfernt werden.");
  console.log("   Signaturen in Turn 1 nicht-leer UND das Echo im zweiten Turn wurde akzeptiert.");
  console.log("   → Vor dem Entfernen einmal einen echten Builder-Lauf mit mehreren Tool-Turns gegentesten.");
  process.exit(0);
}
if (turn2.status === 400) {
  console.log("❌ Signaturen sehen zwar gefüllt aus, aber das Echo im zweiten Turn wird weiterhin mit 400 abgelehnt");
  console.log("   (Signatur vermutlich vorhanden, aber upstream ungültig — z. B. vom Gateway verändert).");
  console.log("   → CLAUDE_CODE_DISABLE_THINKING in web/lib/agent/run.ts muss bleiben.");
  process.exit(1);
}
console.log(`⚠️  Unklares Ergebnis: Turn 2 endete mit HTTP ${turn2.status} (weder OK noch 400).`);
console.log("   → Erneut ausführen; bei wiederholten 5xx liegt ein Transportproblem vor, kein Signatur-Befund.");
process.exit(2);
