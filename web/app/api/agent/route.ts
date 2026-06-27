import { auth } from "@/auth";
import {
  ensureDefaultProject,
  getOwnedProject,
  addMessage,
  getMessages,
  getClientFiles,
  createVersion,
} from "@/lib/projects";
import { listAttachments } from "@/lib/attachments";
import { runAgent } from "@/lib/agent/run";

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
  const history = await getMessages(project.id);
  await addMessage(project.id, "user", message);

  // Make the agent aware of the project's uploaded reference files so it knows
  // to reach for list_attachments / read_attachment. The note is prepended to
  // the prompt (not stored as the user's message). attachmentIds flags the ones
  // just attached this turn for extra emphasis.
  const withAttachments = await withAttachmentContext(project.id, message, body);
  // Each agent turn is a fresh SDK query() with no memory of prior turns, so we
  // reconstruct the conversation from the persisted history and prepend it. This
  // is what lets the agent iterate on the existing app instead of rebuilding it.
  const prompt = withConversationContext(history, withAttachments);

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
      try {
        const run = runAgent({
          projectId: project.id,
          prompt,
          onFileEvent: (event) => {
            filesChanged = true;
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
                  /^mcp__(?:vfs|attachments)__/,
                  "",
                );
                const path = (block.input as { path?: string } | undefined)
                  ?.path;
                send({ type: "tool_use", tool, path });
              }
            }
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
 * Prepends the prior conversation so the agent treats this turn as a
 * continuation of one evolving project rather than a standalone request. Without
 * this, each SDK query() starts blind — the root cause of the agent rebuilding
 * from scratch and ignoring earlier instructions. Code isn't included here: the
 * agent reads the current files from the VFS itself.
 */
function withConversationContext(
  history: { role: string; content: string }[],
  currentPrompt: string,
): string {
  const prior = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-HISTORY_MAX_MESSAGES);
  if (prior.length === 0) return currentPrompt;

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

  return (
    `## Conversation so far\n` +
    `This is the ongoing history of this project. Read it, then treat the new ` +
    `request below as the next step — iterate on the existing files rather than ` +
    `starting over.\n\n` +
    `${transcript}\n\n` +
    `## New request\n${currentPrompt}`
  );
}
