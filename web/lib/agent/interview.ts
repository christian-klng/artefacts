import "server-only";
import { z } from "zod";
import { cortecsChat } from "@/lib/cortecs/chat";
import type { TokenUsage } from "@/lib/cortecs/billing";
import {
  resolvedAnswers,
  type InterviewSpec,
  type InterviewState,
} from "@/lib/interview";

// Server side of the first-prompt concept interview: one small, fast LLM call
// (OpenAI-compatible cortecs path, task "interview") that derives 3 tailored
// single-select questions + 4 theme-fitting color palettes from the user's
// first prompt, plus the prompt/transcript builders the agent route needs.
// Generation failure is always survivable — the caller falls back to building
// directly, so this can never block a user's first build.

const GENERATION_TIMEOUT_MS = 30_000;
const MAX_PROMPT_CHARS = 4000;

// Strict validation of the LLM's raw JSON (the lenient shared parser in
// lib/interview.ts only guards already-persisted rows). Kept here so zod
// stays out of the client bundle.
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const optionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(80),
});

const questionSchema = z.object({
  id: z.string().trim().min(1),
  question: z.string().trim().min(1).max(200),
  options: z
    .array(optionSchema)
    .min(2)
    .max(4)
    .refine(uniqueIds, "option ids must be unique"),
});

const paletteSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(60),
  colors: z.array(z.string().regex(HEX_COLOR)).min(4).max(6),
});

const interviewSpecSchema = z.object({
  intro: z.string().trim().min(1).max(300),
  // Exactly 3 direction questions — the product spec, not a soft preference.
  questions: z
    .array(questionSchema)
    .length(3)
    .refine(uniqueIds, "question ids must be unique"),
  paletteQuestion: z.string().trim().min(1).max(200),
  palettes: z
    .array(paletteSchema)
    .min(3)
    .max(6)
    .refine(uniqueIds, "palette ids must be unique"),
});

function uniqueIds(items: { id: string }[]): boolean {
  return new Set(items.map((i) => i.id)).size === items.length;
}

const SYSTEM_PROMPT = `You scope a web app before it gets built. From the user's first request, produce a short concept interview as STRICT JSON (no markdown fences, no commentary — the raw JSON object only):

{
  "intro": string,            // one friendly sentence leading into the questions
  "questions": [              // EXACTLY 3
    { "id": "q1", "question": string, "options": [ { "id": "o1", "label": string }, ... ] }
  ],
  "paletteQuestion": string,  // headline for the color-scheme question
  "palettes": [               // EXACTLY 4
    { "id": "p1", "name": string, "colors": ["#rrggbb", ...] }  // exactly 5 hex colors
  ]
}

Rules:
- Ask only about directions the request leaves genuinely OPEN (e.g. target audience, scope/features, tone/style, structure, content focus). Never re-ask something the request already settles.
- Each question is single-select with 3-4 options. Options are concrete and short (max ~45 characters), mutually exclusive, no "other" option.
- The 4 palettes must fit the app's theme and be clearly distinct directions (e.g. light/minimal, bold/vivid, dark/elegant, soft/pastel — derived from the theme, not these literal labels). Each palette: a short evocative name and exactly 5 hex colors ordered background → surface → primary → accent → text, with readable contrast between background and text.
- Write intro, questions, options, paletteQuestion and palette names in the SAME LANGUAGE as the user's request.
- ids are exactly: questions "q1".."q3", options "o1".."o4" (per question), palettes "p1".."p4".`;

export type GeneratedInterview = {
  spec: InterviewSpec;
  model: string;
  usage: TokenUsage;
};

/**
 * Generates the interview spec from the user's first prompt. Returns null on
 * any failure (gateway error, timeout, twice-invalid JSON) — callers must then
 * fall back to a normal build turn. Usage is the summed tokens of all attempts
 * so the whole call gets billed, not just the successful attempt.
 */
export async function generateInterview(
  userPrompt: string,
  attachmentNames: string[] = [],
): Promise<GeneratedInterview | null> {
  const prompt =
    userPrompt.length > MAX_PROMPT_CHARS
      ? userPrompt.slice(0, MAX_PROMPT_CHARS) + " […]"
      : userPrompt;
  const attachmentNote =
    attachmentNames.length > 0
      ? `\n\n(The user also uploaded these reference files: ${attachmentNames.join(", ")})`
      : "";

  const usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  let model = "";
  let lastError = "";

  // One retry on invalid output, with the validation error fed back.
  for (let attempt = 0; attempt < 2; attempt++) {
    const retryNote = lastError
      ? `\n\nYour previous reply was rejected (${lastError}). Reply with the corrected raw JSON object only.`
      : "";
    let text: string;
    try {
      const result = await cortecsChat({
        task: "interview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt + attachmentNote + retryNote },
        ],
        temperature: 0.7,
        maxTokens: 1400,
        signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
      });
      text = result.text;
      model = result.model;
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      usage.cacheReadTokens += result.usage.cacheReadTokens;
      usage.cacheCreationTokens += result.usage.cacheCreationTokens;
    } catch (error) {
      // Transport-level failure (timeout, gateway error): don't retry — the
      // second attempt would eat the same latency the user is waiting through.
      console.error("[interview] generation call failed", error);
      return null;
    }

    try {
      const spec = interviewSpecSchema.parse(extractJson(text));
      return { spec, model, usage };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message.slice(0, 500) : "invalid JSON";
      console.warn(`[interview] invalid spec (attempt ${attempt + 1})`);
    }
  }
  return null;
}

/** Tolerates ```json fences and prose around the object; throws if no JSON. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Last resort: the outermost {...} span (models love a leading sentence).
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object found");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

/**
 * The build turn's "new request" after the user answered the interview. The
 * original request itself is already in the replayed conversation history.
 */
export function buildAnswersPrompt(state: InterviewState): string {
  if (!state.answers) return buildSkipPrompt();
  const { pairs, palette } = resolvedAnswers(state.spec, state.answers);
  const lines = pairs.map((p) => `- ${p.question} → ${p.answer}`);
  if (palette) {
    lines.push(`- Color scheme "${palette.name}": ${palette.colors.join(" ")}`);
  }
  return (
    `The user answered the concept interview for their first request (see the conversation above):\n` +
    `${lines.join("\n")}\n\n` +
    `These choices are binding design direction. Build the FIRST version of the app now: ` +
    `apply the chosen direction, define the color scheme's hex values as CSS custom properties and base the design on them, ` +
    `and record the purpose, these decisions and the palette in /CONCEPT.md.`
  );
}

/** The build turn's "new request" when the user skipped the interview. */
export function buildSkipPrompt(): string {
  return (
    `The user skipped the concept interview. Build the FIRST version of the app now, ` +
    `based directly on their request above; make sensible design choices yourself and ` +
    `record the durable ones in /CONCEPT.md.`
  );
}

/**
 * How an interview row appears in the replayed "Conversation so far" of later
 * turns. Answered → a compact Q→A block; pending/skipped → null (omitted, so
 * raw JSON never leaks into the agent transcript).
 */
export function renderInterviewForTranscript(
  state: InterviewState,
): string | null {
  if (state.status !== "answered" || !state.answers) return null;
  const { pairs, palette } = resolvedAnswers(state.spec, state.answers);
  const lines = pairs.map((p) => `${p.question} → ${p.answer}`);
  if (palette) {
    lines.push(`Color scheme "${palette.name}": ${palette.colors.join(" ")}`);
  }
  return `[Concept interview — the user chose:]\n${lines.join("\n")}`;
}
