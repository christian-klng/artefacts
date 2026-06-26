import "server-only";
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import {
  listAttachments,
  getAttachmentText,
  getAttachmentData,
} from "@/lib/attachments";

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

// Default text window per read, so a huge reference file (e.g. a whole foreign
// site's HTML/CSS) doesn't blow up the context in one shot. The agent can page
// through with offset/limit.
const DEFAULT_LIMIT = 20_000;

/**
 * In-process MCP server exposing the project's uploaded reference files as a
 * read-only resource for the agent. Mirrors buildVfsServer, but these are NOT
 * app files: the agent reads them for context (designs, texts, foreign code)
 * and can never write them. Every operation is scoped to `projectId`.
 *
 * read_attachment returns extracted text for text files, or an image content
 * block for images so the model can actually *see* design concepts (vision).
 */
export function buildAttachmentsServer(projectId: string) {
  return createSdkMcpServer({
    name: "attachments",
    version: "1.0.0",
    instructions:
      "User-uploaded reference files (design concepts, texts, specs, foreign " +
      "HTML/CSS). These are read-only CONTEXT to inform what you build — they " +
      "are not part of the app's files. List them and read the relevant ones " +
      "when they help; do not copy them verbatim into the app unless asked.",
    tools: [
      tool(
        "list_attachments",
        "List the user's uploaded reference files (id, name, kind, size, and a short text preview). Read the relevant ones with read_attachment.",
        {},
        async () => {
          const all = await listAttachments(projectId);
          if (all.length === 0) return ok("(no uploaded files)");
          const lines = all.map((a) => {
            const head = `#${a.id} · ${a.filename} · ${a.kind} · ${a.size} bytes`;
            const preview =
              a.preview != null
                ? `\n    preview: ${a.preview.replace(/\s+/g, " ").slice(0, 200)}`
                : "";
            return head + preview;
          });
          return ok(lines.join("\n"));
        },
      ),

      tool(
        "read_attachment",
        "Read one uploaded reference file by its id. Text files return their text (use offset/limit to page through very long files); images return the image itself so you can see it.",
        {
          id: z.string().describe("The attachment id from list_attachments"),
          offset: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("Start character offset for text files (default 0)"),
          limit: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe(`Max characters to return (default ${DEFAULT_LIMIT})`),
        },
        async ({ id, offset, limit }) => {
          const text = await getAttachmentText(projectId, id);
          if (text === null) return err(`Attachment not found: ${id}`);

          // Image → return a vision block from the stored original.
          if (text.extractedText === null) {
            const data = await getAttachmentData(projectId, id);
            if (!data) return err(`Attachment not found: ${id}`);
            if (data.kind !== "image") {
              return ok(`(${data.filename} has no readable text)`);
            }
            return {
              content: [
                {
                  type: "image" as const,
                  data: data.dataBase64,
                  mimeType: data.mimeType,
                },
              ],
            };
          }

          // Text → return a window, with a hint when there's more to read.
          const start = offset ?? 0;
          const size = limit ?? DEFAULT_LIMIT;
          const full = text.extractedText;
          const slice = full.slice(start, start + size);
          const end = start + slice.length;
          const more =
            end < full.length
              ? `\n\n[…truncated. ${full.length} chars total; read more with offset=${end}]`
              : "";
          const header = `# ${text.filename} (chars ${start}–${end} of ${full.length})\n`;
          return ok(header + slice + more);
        },
      ),
    ],
  });
}

// Tool names as the agent loop sees them (mcp__<server>__<tool>).
export const ATTACHMENT_TOOL_NAMES = [
  "mcp__attachments__list_attachments",
  "mcp__attachments__read_attachment",
];
