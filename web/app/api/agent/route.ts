import { auth } from "@/auth";
import {
  ensureDefaultProject,
  getOwnedProject,
  addMessage,
  listFiles,
  createVersion,
} from "@/lib/projects";
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

  // Resolve the target project (scoped to this user) and record the turn.
  const project = body?.projectId
    ? await getOwnedProject(body.projectId, userId)
    : await ensureDefaultProject(userId);
  await addMessage(project.id, "user", message);

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
          prompt: message,
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
                const tool = block.name.replace(/^mcp__vfs__/, "");
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
        send({ type: "files", files: await listFiles(project.id) });
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
