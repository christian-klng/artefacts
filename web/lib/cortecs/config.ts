import "server-only";
import { settingNumber, settingString } from "@/lib/settings";

// Central config for the cortecs.ai LLM router. Single source of truth for
// base URLs, the API key, per-task model selection, and the billing constants.
//
// Non-secret values (models, base URLs, TTL, billing constants) are DB-backed
// via lib/settings.ts so they can be changed in the admin app WITHOUT a redeploy
// (precedence: DB > env > default). This makes the accessors async. The API key
// stays a synchronous env-only read — it is a secret and never leaves the env.
//
// Two transport paths exist (see lib/cortecs/):
//   - "anthropic": Cortecs' Anthropic-compatible /v1/messages endpoint, driven
//     by the Claude Agent SDK (the website builder). Configured via env handed
//     to the SDK subprocess (ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN).
//   - "openai": Cortecs' OpenAI-compatible /v1/chat/completions endpoint, used
//     for small cleanup tasks and the future "Sovereign Servers" builder. Only
//     this path can pass Cortecs' eu_native / preference routing params.

/** Task categories, each mapped to its own env-configured model + transport. */
export type TaskKind = "build" | "cleanup" | "sovereign_build";

export type Preference = "speed" | "cost" | "balanced";

export type ModelChoice = {
  model: string;
  /** Which Cortecs transport / endpoint serves this task. */
  path: "anthropic" | "openai";
  /** Restrict routing to EU-native, regulated providers ("Sovereign Cloud"). */
  euNative?: boolean;
  /** Provider selection preference (openai path only). */
  preference?: Preference;
};

// --- Margin / free tier ----------------------------------------------------

/**
 * Customer-facing markup on the raw Cortecs cost. The user's billed price is
 * `cortecsCost × margin`; the difference is our margin. DB/env-overridable so it
 * can be tuned in the admin app without a deploy. Default 1.20 (+20%).
 */
export function billingMargin(): Promise<number> {
  return settingNumber("BILLING_MARGIN", 1.2);
}

/** One-time EUR credit granted to a user on first use (the free tier). */
export function freeTierGrantEur(): Promise<number> {
  return settingNumber("FREE_TIER_GRANT_EUR", 2.0);
}

/**
 * Safety multiplier in case the /v1/models prices do NOT already include
 * Cortecs' flat 5% fee. Reconcile against GET /manage/usage; if the catalog is
 * net-of-fee, set this to 1.05 (in the admin app). Assumed 1.0 (fee included).
 */
export function cortecsFeeMultiplier(): Promise<number> {
  return settingNumber("CORTECS_FEE_MULTIPLIER", 1.0);
}

// --- Base URLs / auth ------------------------------------------------------

export function cortecsApiKey(): string {
  const key = process.env.CORTECS_API_KEY;
  if (!key) {
    throw new Error(
      "CORTECS_API_KEY is not set — required to reach the cortecs.ai router.",
    );
  }
  return key;
}

/** Base for the Anthropic-compatible endpoint (used as ANTHROPIC_BASE_URL). */
export async function cortecsAnthropicBaseUrl(): Promise<string> {
  return stripTrailingSlash(
    await settingString("CORTECS_ANTHROPIC_BASE_URL", "https://api.cortecs.ai"),
  );
}

/** Base for the OpenAI-compatible endpoint (chat completions, models). */
export async function cortecsOpenAiBaseUrl(): Promise<string> {
  return stripTrailingSlash(
    await settingString("CORTECS_OPENAI_BASE_URL", "https://api.cortecs.ai/v1"),
  );
}

/** How long the /v1/models price catalog is memoized, in ms (default 1h). */
export function cortecsPriceTtlMs(): Promise<number> {
  return settingNumber("CORTECS_PRICE_TTL_MS", 60 * 60 * 1000);
}

// --- Model selection per task ----------------------------------------------

/**
 * Resolves which model + transport handles a task. The website builder is a
 * Claude model over the Anthropic path; cleanup runs any (cheap) model over the
 * OpenAI path; the sovereign builder pins eu_native routing.
 *
 * `opts` lets a future GDPR-vs-Sovereign UI toggle pass routing flags without
 * touching call sites.
 */
export async function modelForTask(
  kind: TaskKind,
  opts?: { euNative?: boolean; preference?: Preference },
): Promise<ModelChoice> {
  switch (kind) {
    case "build":
      return {
        model: await settingString("CORTECS_BUILD_MODEL", "claude-opus4-8"),
        path: "anthropic",
      };
    case "cleanup":
      return {
        model: await settingString("CORTECS_CLEANUP_MODEL", "claude-haiku-4-5"),
        path: "openai",
        preference: opts?.preference ?? "cost",
        euNative: opts?.euNative,
      };
    case "sovereign_build": {
      // Sovereign falls back to the regular build model when its own override
      // is unset (either source), then to the built-in default.
      const buildModel = await settingString(
        "CORTECS_BUILD_MODEL",
        "claude-opus4-8",
      );
      return {
        model: await settingString("CORTECS_SOVEREIGN_BUILD_MODEL", buildModel),
        path: "openai",
        euNative: opts?.euNative ?? true,
        preference: opts?.preference,
      };
    }
  }
}

// --- helpers ---------------------------------------------------------------

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
