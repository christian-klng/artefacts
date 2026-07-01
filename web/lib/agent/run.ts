import "server-only";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildVfsServer, VFS_TOOL_NAMES, type VfsEvent } from "./tools";
import {
  buildAttachmentsServer,
  ATTACHMENT_TOOL_NAMES,
} from "./attachment-tools";
import { buildDatabaseServer, DATABASE_TOOL_NAMES } from "./tools-db";
import { SYSTEM_PROMPT } from "./system-prompt";
import {
  cortecsAnthropicBaseUrl,
  cortecsApiKey,
  modelForTask,
} from "@/lib/cortecs/config";

/**
 * Runs one agent turn against a project's virtual filesystem and returns the
 * async iterable of SDK messages. The agent is restricted to the VFS tools and
 * runs hermetically (no host settings, no real filesystem access).
 */
export async function runAgent({
  projectId,
  prompt,
  onFileEvent,
}: {
  projectId: string;
  prompt: string;
  onFileEvent: (event: VfsEvent) => void;
}) {
  const vfs = buildVfsServer(projectId, onFileEvent);
  const attachments = buildAttachmentsServer(projectId, onFileEvent);
  const appdb = buildDatabaseServer(projectId, onFileEvent);

  const { model } = await modelForTask("build");
  const anthropicBaseUrl = await cortecsAnthropicBaseUrl();

  return query({
    prompt,
    options: {
      model,
      systemPrompt: SYSTEM_PROMPT,
      mcpServers: { vfs, attachments, appdb },
      allowedTools: [
        ...VFS_TOOL_NAMES,
        ...ATTACHMENT_TOOL_NAMES,
        ...DATABASE_TOOL_NAMES,
      ],
      // Only the sandboxed VFS tools are available, so auto-approving them is
      // safe and avoids interactive permission prompts on the server.
      permissionMode: "bypassPermissions",
      // Hermetic: ignore any local CLAUDE.md / settings on the server host.
      settingSources: [],
      maxTurns: 50,
      // Route the builder through cortecs.ai's Anthropic-compatible endpoint.
      // The SDK spawns a subprocess and reads ANTHROPIC_BASE_URL/AUTH_TOKEN from
      // its environment. NOTE: options.env REPLACES the subprocess environment
      // (it does not merge) — spread process.env or the subprocess loses
      // PATH/HOME and fails to spawn.
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: anthropicBaseUrl,
        ANTHROPIC_AUTH_TOKEN: cortecsApiKey(),
      },
    },
  });
}
