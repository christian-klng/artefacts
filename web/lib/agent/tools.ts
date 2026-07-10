import "server-only";
import { z } from "zod";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { timedTool as tool } from "./timed-tool";
import {
  listFiles,
  readFile,
  readFileRaw,
  writeFile,
  editFile,
  deleteFile,
} from "@/lib/projects";
import {
  lintDensity,
  formatDensityNote,
  type DensityRule,
} from "@/lib/density-lint";

export type VfsAssetMeta = { mimeType: string | null; size: number; hash: string };

// Event emitted to the route so it can push live file updates over SSE.
export type VfsEvent =
  | { type: "file_changed"; path: string; content: string } // text file
  | { type: "asset_changed"; path: string; asset: VfsAssetMeta } // binary asset
  | { type: "file_deleted"; path: string }
  | { type: "attachments_changed" } // the "Dateien" list changed (e.g. embed)
  | { type: "database_changed"; tables: string[] }; // schema provisioned/applied

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

// Advisory density readout appended to /index.html writes: a measured
// violation arriving in the tool result gets fixed far more reliably than a
// standing prompt rule (same effect that makes agents self-correct on
// compiler errors). Only rules the write NEWLY introduced (vs the pre-write
// content) are reported, so rewriting an already-dense page for an unrelated
// fix doesn't nag — the per-turn route injection covers legacy density with
// its own bounded mandate. `reported` tracks what this TURN already flagged:
// those rules keep resurfacing as "still unresolved" while present, so a
// failed fix attempt doesn't read as success. A lint error must never break
// a write.
function densityNote(
  reported: Set<DensityRule>,
  content: string,
  previous: string | null,
): string {
  try {
    const findings = lintDensity(content);
    const baseline =
      previous != null
        ? new Set(lintDensity(previous).map((f) => f.rule))
        : new Set<DensityRule>();
    const fresh = findings.filter(
      (f) => !baseline.has(f.rule) && !reported.has(f.rule),
    );
    const open = findings.filter((f) => reported.has(f.rule));
    for (const f of fresh) reported.add(f.rule);
    const parts: string[] = [];
    if (fresh.length > 0) parts.push(formatDensityNote(fresh));
    if (open.length > 0) {
      parts.push(
        "Still unresolved from the density check earlier in this turn:\n" +
          open.map((f) => `- ${f.measured}`).join("\n") +
          "\n(If a listed item is deliberate — app UI, dense design DNA, or user-requested — ignore it and move on.)",
      );
    }
    return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
  } catch {
    return "";
  }
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
  // Density rules already flagged during THIS turn (see densityNote).
  const reportedDensity = new Set<DensityRule>();
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
        "Read the full contents of a text file by its absolute path (e.g. /index.html).",
        { path: z.string() },
        async ({ path }) => {
          const raw = await readFileRaw(projectId, path);
          if (raw === null) return err(`File not found: ${path}`);
          if (raw.encoding === "base64") {
            return err(
              `${path} is a binary asset (${raw.mimeType ?? "unknown type"}) — it can't be read as text. Reference it by path instead.`,
            );
          }
          return ok(raw.content);
        },
      ),

      tool(
        "write_file",
        "Create or overwrite a file with the given contents.",
        { path: z.string(), content: z.string() },
        async ({ path, content }) => {
          // Pre-write baseline so a full rewrite of an already-dense page
          // doesn't re-flag pre-existing density (see densityNote).
          const previous =
            path === "/index.html" ? await readFile(projectId, path) : null;
          await writeFile(projectId, path, content);
          onEvent({ type: "file_changed", path, content });
          const note =
            path === "/index.html"
              ? densityNote(reportedDensity, content, previous)
              : "";
          return ok(`Wrote ${path}${note}`);
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
          const raw = await readFileRaw(projectId, path);
          if (raw?.encoding === "base64") {
            return err(`${path} is a binary asset and can't be edited as text.`);
          }
          const result = await editFile(projectId, path, old_string, new_string);
          if (!result.ok) return err(result.error);
          const content = (await readFile(projectId, path)) ?? "";
          onEvent({ type: "file_changed", path, content });
          const note =
            path === "/index.html"
              ? densityNote(reportedDensity, content, raw?.content ?? null)
              : "";
          return ok(`Edited ${path}${note}`);
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
