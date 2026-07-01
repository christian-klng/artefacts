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
      const send = (event: unknown) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );

      send({ type: "project", id: project.id });

      let assistantText = "";
      let filesChanged = false;
      // The SDK's terminal `result` message carries per-model token usage — our
      // billing source (we self-compute EUR cost; total_cost_usd is Anthropic-
      // priced and meaningless under Cortecs).
      let modelUsage: Record<string, ModelTokens> | null = null;
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
          if (msg.type === "assistant") {
            for (const block of msg.message.content) {
              if (block.type === "text" && block.text) {
                assistantText += block.text;
                send({ type: "assistant_text", text: block.text });
              } else if (block.type === "tool_use") {
                const tool = block.name.replace(
                  /^mcp__(?:vfs|attachments|appdb)__/,
                  "",
                );
                const path = (block.input as { path?: string } | undefined)
                  ?.path;
                send({ type: "tool_use", tool, path });
              }
            }
          } else if (msg.type === "result") {
            modelUsage = msg.modelUsage as Record<string, ModelTokens>;
          }
        }

        if (assistantText.trim() !== "") {
          await addMessage(project.id, "assistant", assistantText);
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
        controller.close();
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
