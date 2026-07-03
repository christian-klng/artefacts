import { auth } from "@/auth";
import {
  ensureDefaultProject,
  getOwnedProject,
  addMessage,
  getMessages,
  getClientFiles,
  createVersion,
  readFile,
} from "@/lib/projects";
import { CONCEPT_PATH, isInternalVfsPath } from "@/lib/concept";
import { listAttachments } from "@/lib/attachments";
import { runAgent } from "@/lib/agent/run";
import { modelForTask } from "@/lib/cortecs/config";
import {
  ensureCredit,
  billModelUsage,
  recordUsageAndDeduct,
  type ModelTokens,
} from "@/lib/cortecs/billing";

// The Agent SDK needs Node APIs (and may spawn a subprocess) — never the edge
// runtime. Allow long-running agent turns.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  const message = body?.message;
  if (typeof message !== "string" || message.trim() === "") {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  // Resolve the target project (scoped to this user). Read the prior chat
  // history BEFORE recording this turn, so the new message isn't duplicated in
  // the transcript we feed back to the agent.
  const project = body?.projectId
    ? await getOwnedProject(body.projectId, userId)
    : await ensureDefaultProject(userId);

  // Pre-flight budget gate. Token usage is only known AFTER a turn (which can be
  // up to 50 sub-turns), so we can't pre-charge — we gate on balance > 0, run,
  // then deduct. A user near zero may overshoot slightly negative on their last
  // turn; the next request's gate then blocks until they top up. Grants the free
  // tier lazily on first use.
  const balanceEur = await ensureCredit(userId);
  if (balanceEur <= 0) {
    return Response.json(
      { error: "insufficient_credit", balanceEur },
      { status: 402 },
    );
  }

  const history = await getMessages(project.id);
  // The agent's distilled design memory (durable decisions). Survives the
  // transcript window cap; always re-injected so it's considered every turn.
  const concept = await readFile(project.id, CONCEPT_PATH);
  await addMessage(project.id, "user", message);

  // Make the agent aware of the project's uploaded reference files so it knows
  // to reach for list_attachments / read_attachment. The note is prepended to
  // the prompt (not stored as the user's message). attachmentIds flags the ones
  // just attached this turn for extra emphasis.
  const withAttachments = await withAttachmentContext(project.id, message, body);
  // Each agent turn is a fresh SDK query() with no memory of prior turns, so we
  // reconstruct context from the persisted concept + chat history and prepend it.
  // This is what lets the agent iterate on the existing app instead of rebuilding.
  const prompt = withProjectContext(concept, history, withAttachments);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        // A closed controller (client navigated away mid-run) must not kill
        // the turn — persistence and billing below still have to happen.
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {}
      };
      // SSE comment frames keep idle proxies (Traefik) from cutting the
      // connection during long silent stretches; the client skips non-data lines.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {}
      }, 15_000);

      send({ type: "project", id: project.id });

      // Ordered log of what this turn produced, mirroring the client's live
      // view: separate assistant text bubbles interleaved with tool-call rows.
      // Persisted row-by-row so a reload reconstructs the same transcript
      // instead of one merged blob with the tool lines lost.
      const turnMessages: {
        role: "assistant" | "tool";
        content: string;
        tool?: string;
      }[] = [];
      let filesChanged = false;
      // The SDK's terminal `result` message carries per-model token usage — our
      // billing source (we self-compute EUR cost; total_cost_usd is Anthropic-
      // priced and meaningless under Cortecs).
      let modelUsage: Record<string, ModelTokens> | null = null;
      // --- Live progress (includePartialMessages) ---
      // Raw stream events let us forward assistant text as it's generated and
      // show tool-input generation (the minutes-long silent stretch of a build)
      // as live progress. The complete assistant message still follows and
      // stays the source of truth for persistence; streamedTextChars tracks how
      // much of the current message's text already went out as deltas so the
      // committed block isn't sent twice.
      let streamedTextChars = 0;
      // The tool_use block currently streaming its input, if any.
      let liveTool: {
        name: string;
        path?: string;
        chars: number;
        // First bytes of the input JSON, scanned once for a complete "path"
        // value (capped so a content-first input can't trigger O(n²) rescans).
        sniff: string;
        lastSentChars: number;
        lastSentAt: number;
      } | null = null;
      try {
        const run = await runAgent({
          projectId: project.id,
          prompt,
          onFileEvent: (event) => {
            filesChanged = true;
            // Internal files (CONCEPT.md) are agent memory: snapshot them in a
            // version, but never surface them in the client's file tree/preview.
            if ("path" in event && isInternalVfsPath(event.path)) return;
            send(event);
          },
        });

        for await (const msg of run) {
          if (msg.type === "stream_event") {
            if (msg.parent_tool_use_id) continue; // subagent-internal, not ours
            const ev = msg.event;
            if (ev.type === "message_start") {
              streamedTextChars = 0;
            } else if (ev.type === "content_block_start") {
              if (ev.content_block.type === "tool_use") {
                const tool = ev.content_block.name.replace(/^mcp__[a-z]+__/, "");
                liveTool = {
                  name: tool,
                  chars: 0,
                  sniff: "",
                  lastSentChars: 0,
                  lastSentAt: Date.now(),
                };
                send({ type: "tool_start", tool });
              }
            } else if (ev.type === "content_block_delta") {
              if (ev.delta.type === "text_delta" && ev.delta.text) {
                streamedTextChars += ev.delta.text.length;
                send({ type: "assistant_text", text: ev.delta.text });
              } else if (ev.delta.type === "input_json_delta" && liveTool) {
                liveTool.chars += ev.delta.partial_json.length;
                let pathFound = false;
                if (liveTool.path === undefined && liveTool.sniff.length < 8192) {
                  liveTool.sniff += ev.delta.partial_json;
                  const m = liveTool.sniff.match(
                    /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/,
                  );
                  if (m) {
                    try {
                      liveTool.path = JSON.parse(`"${m[1]}"`) as string;
                    } catch {
                      liveTool.path = m[1];
                    }
                    pathFound = true;
                  }
                }
                const now = Date.now();
                if (
                  pathFound ||
                  liveTool.chars - liveTool.lastSentChars >= 2048 ||
                  now - liveTool.lastSentAt >= 750
                ) {
                  liveTool.lastSentChars = liveTool.chars;
                  liveTool.lastSentAt = now;
                  send({
                    type: "tool_progress",
                    tool: liveTool.name,
                    path: liveTool.path,
                    chars: liveTool.chars,
                  });
                }
              }
            } else if (ev.type === "content_block_stop") {
              liveTool = null;
            }
          } else if (msg.type === "assistant") {
            for (const block of msg.message.content) {
              if (block.type === "text" && block.text) {
                // Merge into the current assistant bubble, or start a new one
                // if a tool row intervened — matches the client's live
                // assistant_text handling so live and reloaded views agree.
                const last = turnMessages[turnMessages.length - 1];
                if (last?.role === "assistant") last.content += block.text;
                else
                  turnMessages.push({ role: "assistant", content: block.text });
                // Live view: only what wasn't already streamed as deltas
                // (normally nothing — the whole block streamed already).
                const alreadyStreamed = Math.min(
                  streamedTextChars,
                  block.text.length,
                );
                streamedTextChars -= alreadyStreamed;
                const remainder = block.text.slice(alreadyStreamed);
                if (remainder) send({ type: "assistant_text", text: remainder });
              } else if (block.type === "tool_use") {
                const tool = block.name.replace(/^mcp__[a-z]+__/, "");
                const path = (block.input as { path?: string } | undefined)
                  ?.path;
                const label = `${tool}${path ? ` ${path}` : ""}`;
                turnMessages.push({ role: "tool", content: label, tool });
                send({ type: "tool_use", tool, path });
              }
            }
            // A message that streamed no deltas (or was synthetic) must not
            // leak its counter into the next round.
            streamedTextChars = 0;
          } else if (msg.type === "result") {
            modelUsage = msg.modelUsage as Record<string, ModelTokens>;
          }
        }

        // Persist the turn in order. Sequential awaits keep createdAt
        // monotonic, so getMessages' createdAt ordering restores this exact
        // sequence. Skip empty assistant bubbles (e.g. a trailing tool call
        // with no closing text).
        for (const tm of turnMessages) {
          if (tm.role === "assistant" && tm.content.trim() === "") continue;
          await addMessage(project.id, tm.role, tm.content, tm.tool);
        }
        const client = await getClientFiles(project.id);
        send({ type: "files", files: client.files, assets: client.assets });
        // Snapshot the result so the user can restore it later.
        if (filesChanged) {
          const version = await createVersion(project.id);
          send({
            type: "version",
            id: version.id,
            label: version.label,
            createdAt: version.createdAt,
          });
        }

        // Bill the turn and surface the cost. A billing failure must NEVER lose
        // the user's work, so it's isolated — log and continue to `done`.
        if (modelUsage) {
          try {
            const { model: buildModel } = await modelForTask("build");
            const billed = await billModelUsage(modelUsage, buildModel);
            if (billed) {
              const newBalanceEur = await recordUsageAndDeduct({
                userId,
                projectId: project.id,
                task: "build",
                model: billed.model,
                provider: billed.provider,
                usage: billed.usage,
                cost: billed.cost,
              });
              send({
                type: "usage",
                model: billed.model,
                inputTokens: billed.usage.inputTokens,
                outputTokens: billed.usage.outputTokens,
                cacheReadTokens: billed.usage.cacheReadTokens,
                cacheCreationTokens: billed.usage.cacheCreationTokens,
                billedEur: billed.cost.billedEur,
                balanceEur: newBalanceEur,
              });
            }
          } catch (billingError) {
            console.error("[agent] billing failed", billingError);
          }
        }

        send({ type: "done" });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Agent error",
        });
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Prepends a note about available reference files so the agent uses its tools. */
async function withAttachmentContext(
  projectId: string,
  message: string,
  body: unknown,
): Promise<string> {
  const all = await listAttachments(projectId);
  if (all.length === 0) return message;

  const newIds = new Set(
    Array.isArray((body as { attachmentIds?: unknown })?.attachmentIds)
      ? ((body as { attachmentIds: unknown[] }).attachmentIds.filter(
          (x): x is string => typeof x === "string",
        ))
      : [],
  );

  const list = all
    .map(
      (a) =>
        `#${a.id} ${a.filename} (${a.kind})${newIds.has(a.id) ? " [just attached]" : ""}`,
    )
    .join(", ");

  return (
    `[Reference files the user uploaded for this project — read the relevant ones ` +
    `with list_attachments / read_attachment before building: ${list}.]\n\n` +
    message
  );
}

// How much prior conversation to replay. The actual app state lives in the VFS
// (the agent reads it with its tools), so the transcript only needs to carry the
// dialogue — we cap it to keep the prompt bounded on long-running projects.
const HISTORY_MAX_MESSAGES = 24;
const HISTORY_MAX_CHARS_PER_MESSAGE = 4000;

/**
 * Prepends the project's durable concept and the prior conversation so the agent
 * treats this turn as a continuation of one evolving project rather than a
 * standalone request. Without this, each SDK query() starts blind — the root
 * cause of the agent rebuilding from scratch and ignoring earlier instructions.
 * Code isn't included here: the agent reads the current files from the VFS itself.
 */
function withProjectContext(
  concept: string | null,
  history: { role: string; content: string }[],
  currentPrompt: string,
): string {
  const prior = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-HISTORY_MAX_MESSAGES);
  if (prior.length === 0 && !concept?.trim()) return currentPrompt;

  const sections: string[] = [];

  if (concept?.trim()) {
    sections.push(
      `## Project concept (your durable memory of this project)\n` +
        `These are the established decisions for this project. Honor them, and ` +
        `keep this file (${CONCEPT_PATH}) up to date as decisions evolve.\n\n` +
        concept.trim(),
    );
  }

  if (prior.length > 0) {
    const transcript = prior
      .map((m) => {
        const speaker = m.role === "assistant" ? "Assistant" : "User";
        const text =
          m.content.length > HISTORY_MAX_CHARS_PER_MESSAGE
            ? m.content.slice(0, HISTORY_MAX_CHARS_PER_MESSAGE) + " […truncated]"
            : m.content;
        return `${speaker}: ${text}`;
      })
      .join("\n\n");
    sections.push(
      `## Conversation so far\n` +
        `This is the ongoing history of this project. Read it, then treat the new ` +
        `request below as the next step — iterate on the existing files rather ` +
        `than starting over.\n\n` +
        transcript,
    );
  }

  sections.push(`## New request\n${currentPrompt}`);
  return sections.join("\n\n");
}
