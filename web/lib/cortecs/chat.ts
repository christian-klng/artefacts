import "server-only";
import {
  cortecsApiKey,
  cortecsOpenAiBaseUrl,
  modelForTask,
  type Preference,
  type TaskKind,
} from "./config";
import type { TokenUsage } from "./billing";

// Thin OpenAI-compatible client for Cortecs' /v1/chat/completions. Used for
// small cleanup tasks and (later) the "Sovereign Servers" builder option — the
// only path that can pass Cortecs' eu_native / preference routing params. The
// website builder does NOT use this; it runs through the Claude Agent SDK
// against the Anthropic-compatible endpoint (lib/agent/run.ts).
//
// Plain fetch (no `openai` dependency) so the non-standard eu_native/preference
// fields pass through untouched. Caller's route must be runtime = "nodejs".

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatResult = {
  text: string;
  model: string;
  usage: TokenUsage;
};

export async function cortecsChat(args: {
  task: TaskKind;
  messages: ChatMessage[];
  euNative?: boolean;
  preference?: Preference;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<ChatResult> {
  const choice = modelForTask(args.task, {
    euNative: args.euNative,
    preference: args.preference,
  });

  const body: Record<string, unknown> = {
    model: choice.model,
    messages: args.messages,
  };
  if (choice.preference) body.preference = choice.preference;
  if (choice.euNative) body.eu_native = true;
  if (args.temperature != null) body.temperature = args.temperature;
  if (args.maxTokens != null) body.max_tokens = args.maxTokens;

  const res = await fetch(`${cortecsOpenAiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cortecsApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: args.signal,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `Cortecs chat failed: ${res.status} ${res.statusText} ${errBody}`.trim(),
    );
  }

  const json = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      // Some providers surface cached prompt tokens here.
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  const cachedTokens = json.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    model: json.model ?? choice.model,
    usage: {
      // Keep cached tokens separate so they're priced as cache reads, not
      // double-counted with the (non-cached) prompt tokens.
      inputTokens: Math.max(0, (json.usage?.prompt_tokens ?? 0) - cachedTokens),
      outputTokens: json.usage?.completion_tokens ?? 0,
      cacheReadTokens: cachedTokens,
      cacheCreationTokens: 0,
    },
  };
}
