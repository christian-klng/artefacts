import "server-only";
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import {
  listFiles,
  readFile,
  writeFile,
  editFile,
  deleteFile,
} from "@/lib/projects";

// Event emitted to the route so it can push live file updates over SSE.
export type VfsEvent =
  | { type: "file_changed"; path: string; content: string }
  | { type: "file_deleted"; path: string };

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/**
 * Builds an in-process MCP server exposing a virtual filesystem backed by the
 * project's rows in Postgres. The agent gets file tools that look like Claude
 * Code's, but every operation is scoped to `projectId` and never touches the
 * host disk — the basis for cheap multi-tenant isolation.
 */
export function buildVfsServer(
  projectId: string,
  onEvent: (event: VfsEvent) => void,
) {
  return createSdkMcpServer({
    name: "vfs",
    version: "1.0.0",
    instructions:
      "The project's files live in this virtual filesystem. Use these tools " +
      "for all file operations; there is no shell and no other filesystem.",
    tools: [
      tool(
        "list_files",
        "List every file path in the project.",
        {},
        async () => {
          const all = await listFiles(projectId);
          if (all.length === 0) return ok("(no files yet)");
          return ok(all.map((f) => f.path).join("\n"));
        },
      ),

      tool(
        "read_file",
        "Read the full contents of a file by its absolute path (e.g. /index.html).",
        { path: z.string() },
        async ({ path }) => {
          const content = await readFile(projectId, path);
          if (content === null) return err(`File not found: ${path}`);
          return ok(content);
        },
      ),

      tool(
        "write_file",
        "Create or overwrite a file with the given contents.",
        { path: z.string(), content: z.string() },
        async ({ path, content }) => {
          await writeFile(projectId, path, content);
          onEvent({ type: "file_changed", path, content });
          return ok(`Wrote ${path}`);
        },
      ),

      tool(
        "edit_file",
        "Replace a single, unique occurrence of old_string with new_string in a file.",
        {
          path: z.string(),
          old_string: z.string(),
          new_string: z.string(),
        },
        async ({ path, old_string, new_string }) => {
          const result = await editFile(projectId, path, old_string, new_string);
          if (!result.ok) return err(result.error);
          onEvent({
            type: "file_changed",
            path,
            content: (await readFile(projectId, path)) ?? "",
          });
          return ok(`Edited ${path}`);
        },
      ),

      tool(
        "delete_file",
        "Delete a file from the project.",
        { path: z.string() },
        async ({ path }) => {
          const deleted = await deleteFile(projectId, path);
          if (!deleted) return err(`File not found: ${path}`);
          onEvent({ type: "file_deleted", path });
          return ok(`Deleted ${path}`);
        },
      ),
    ],
  });
}

// Tool names as the agent loop sees them (mcp__<server>__<tool>), used to
// restrict the agent to exactly these tools.
export const VFS_TOOL_NAMES = [
  "mcp__vfs__list_files",
  "mcp__vfs__read_file",
  "mcp__vfs__write_file",
  "mcp__vfs__edit_file",
  "mcp__vfs__delete_file",
];
