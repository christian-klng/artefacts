import "server-only";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildVfsServer, VFS_TOOL_NAMES, type VfsEvent } from "./tools";
import {
  buildAttachmentsServer,
  ATTACHMENT_TOOL_NAMES,
} from "./attachment-tools";
import { SYSTEM_PROMPT } from "./system-prompt";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

/**
 * Runs one agent turn against a project's virtual filesystem and returns the
 * async iterable of SDK messages. The agent is restricted to the VFS tools and
 * runs hermetically (no host settings, no real filesystem access).
 */
export function runAgent({
  projectId,
  prompt,
  onFileEvent,
}: {
  projectId: string;
  prompt: string;
  onFileEvent: (event: VfsEvent) => void;
}) {
  const vfs = buildVfsServer(projectId, onFileEvent);
  const attachments = buildAttachmentsServer(projectId);

  return query({
    prompt,
    options: {
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      mcpServers: { vfs, attachments },
      allowedTools: [...VFS_TOOL_NAMES, ...ATTACHMENT_TOOL_NAMES],
      // Only the sandboxed VFS tools are available, so auto-approving them is
      // safe and avoids interactive permission prompts on the server.
      permissionMode: "bypassPermissions",
      // Hermetic: ignore any local CLAUDE.md / settings on the server host.
      settingSources: [],
      maxTurns: 50,
    },
  });
}
