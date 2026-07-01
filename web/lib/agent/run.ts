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
  cortecsTierModels,
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
  const tiers = await cortecsTierModels();

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
        // cortecs is an LLM GATEWAY that serves models under its OWN catalog ids
        // (e.g. `claude-opus4-8`, not Anthropic's `claude-opus-4-8`). Claude Code
        // validates model ids against its built-in list and rejects unknown ones
        // with "There's an issue with the selected model (…). It may not exist or
        // you may not have access to it." — even though cortecs serves the model
        // fine. We teach Claude Code the gateway's catalog three ways (belt &
        // suspenders, all just env for the spawned CLI):
        //  1. discover the gateway's /v1/models list (v2.1.129+),
        //  2. whitelist our exact build-model id, skipping validation for it,
        //  3. map every tier alias + the background/"haiku" model to real cortecs
        //     ids (background calls otherwise use an Anthropic id cortecs lacks).
        CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
        ANTHROPIC_CUSTOM_MODEL_OPTION: model,
        ANTHROPIC_DEFAULT_OPUS_MODEL: tiers.opus,
        ANTHROPIC_DEFAULT_SONNET_MODEL: tiers.sonnet,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: tiers.haiku,
      },
    },
  });
}
