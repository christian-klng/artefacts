import "server-only";
import { z } from "zod";
import { cortecsChat } from "@/lib/cortecs/chat";
import type { TokenUsage } from "@/lib/cortecs/billing";
import type { WorldCandidate } from "@/lib/design-worlds";
import {
  resolvedAnswers,
  type InterviewSpec,
  type InterviewState,
} from "@/lib/interview";

// Server side of the first-prompt concept interview: one small, fast LLM call
// (OpenAI-compatible cortecs path, task "interview") that derives 3 tailored
// single-select questions + 3 instantiated style directions from the user's
// first prompt and a server-sampled set of style-world candidates
// (lib/design-worlds.ts). The dice pick what is offered, the LLM picks what
// fits and makes it project-specific, the user picks what ships — that split
// is what keeps the output from collapsing into one "AI look".
// Generation failure is always survivable — the caller falls back to building
// directly, so this can never block a user's first build.

const GENERATION_TIMEOUT_MS = 45_000;
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

function uniqueIds(items: { id: string }[]): boolean {
  return new Set(items.map((i) => i.id)).size === items.length;
}

/**
 * The spec schema is built per call: worldIds and font pairings are only
 * valid if they come from the candidates this request actually offered.
 */
function specSchema(candidates: WorldCandidate[]) {
  const worlds = new Map(candidates.map((c) => [c.world.id, c.world]));

  const styleSchema = z
    .object({
      id: z.string().trim().min(1),
      worldId: z
        .string()
        .refine((id) => worlds.has(id), "worldId must be one of the offered candidates"),
      name: z.string().trim().min(1).max(60),
      vibe: z.string().trim().min(1).max(160),
      palette: z.array(z.string().regex(HEX_COLOR)).length(5),
      headingFontId: z.string().trim().min(1),
      bodyFontId: z.string().trim().min(1),
      accentFontId: z.string().trim().min(1).nullable().optional(),
    })
    .superRefine((s, ctx) => {
      const world = worlds.get(s.worldId);
      if (!world) return; // already reported by the worldId refine
      const matches = world.pairings.some(
        (p) =>
          p.heading === s.headingFontId &&
          p.body === s.bodyFontId &&
          (s.accentFontId == null || p.accent === s.accentFontId),
      );
      if (!matches) {
        ctx.addIssue({
          code: "custom",
          message: `fonts for world "${s.worldId}" must be exactly one of its offered pairings`,
        });
      }
    });

  return z.object({
    intro: z.string().trim().min(1).max(300),
    // Exactly 3 direction questions — the product spec, not a soft preference.
    questions: z
      .array(questionSchema)
      .length(3)
      .refine(uniqueIds, "question ids must be unique"),
    styleQuestion: z.string().trim().min(1).max(200),
    styles: z
      .array(styleSchema)
      .length(3)
      .refine(uniqueIds, "style ids must be unique")
      .refine(
        (styles) => new Set(styles.map((s) => s.worldId)).size === styles.length,
        "each style must use a different world",
      ),
  });
}

const SYSTEM_PROMPT = `You scope a web app before it gets built. From the user's first request and a set of offered style-world candidates, produce a short concept interview as STRICT JSON (no markdown fences, no commentary — the raw JSON object only):

{
  "intro": string,            // one friendly sentence leading into the questions
  "questions": [              // EXACTLY 3
    { "id": "q1", "question": string, "options": [ { "id": "o1", "label": string }, ... ] }
  ],
  "styleQuestion": string,    // headline for the design-direction question
  "styles": [                 // EXACTLY 3, each from a DIFFERENT offered world
    {
      "id": "s1",
      "worldId": string,          // one of the offered candidates' worldIds
      "name": string,             // a project-specific direction name (max ~40 chars)
      "vibe": string,             // one-line character sketch (max ~120 chars)
      "palette": ["#rrggbb", ...] // exactly 5 hex: background → surface → primary → accent → text
      "headingFontId": string,    // copy EXACTLY one of that world's offered pairings
      "bodyFontId": string,
      "accentFontId": string | null
    }
  ]
}

Rules:
- Questions: ask only about directions the request leaves genuinely OPEN (target audience, scope/features, tone, structure, content focus). Never re-ask something the request already settles. Each question is single-select with 3-4 options; options are concrete and short (max ~45 characters), mutually exclusive, no "other" option.
- Styles: from the offered candidates, choose the 3 that fit the app's subject and audience BEST and MATCH THE REGISTER the request implies. For professional/B2B/enterprise/finance/healthcare/institutional apps, prefer restrained, expected, trustworthy directions — the user wants to feel in safe hands, not surprised. For personal, creative, cultural, playful or consumer apps, favor character and distinctiveness. Never pick an absurd mismatch for the subject. Instantiate each for THIS project: a fitting name and vibe in the project's context (not the world's generic name), and a palette that follows that world's colorPhilosophy with readable background↔text contrast. The 3 palettes must be clearly distinct.
- Fonts: copy headingFontId/bodyFontId (and accentFontId if you use one) VERBATIM from one single pairing offered for that world. Never invent font ids, never mix pairings.
- Write intro, questions, options, styleQuestion, style names and vibes in the SAME LANGUAGE as the user's request.
- ids are exactly: questions "q1".."q3", options "o1".."o4" (per question), styles "s1".."s3".`;

export type GeneratedInterview = {
  spec: InterviewSpec;
  model: string;
  usage: TokenUsage;
};

/**
 * Generates the interview spec from the user's first prompt and the sampled
 * world candidates. Returns null on any failure (gateway error, timeout,
 * twice-invalid JSON) — callers must then fall back to a normal build turn.
 * Usage is the summed tokens of all attempts so the whole call gets billed,
 * not just the successful attempt.
 */
export async function generateInterview(
  userPrompt: string,
  attachmentNames: string[],
  candidates: WorldCandidate[],
): Promise<GeneratedInterview | null> {
  const prompt =
    userPrompt.length > MAX_PROMPT_CHARS
      ? userPrompt.slice(0, MAX_PROMPT_CHARS) + " […]"
      : userPrompt;
  const attachmentNote =
    attachmentNames.length > 0
      ? `\n\n(The user also uploaded these reference files: ${attachmentNames.join(", ")})`
      : "";
  // Compact candidate block — everything the LLM needs to choose and
  // instantiate; sampled mutations stay server-side and are merged in below.
  const candidateBlock =
    `\n\nOffered style-world candidates (pick the 3 best fits):\n` +
    JSON.stringify(
      candidates.map((c) => ({
        worldId: c.world.id,
        name: c.world.name,
        blurb: c.world.blurb,
        epoch: c.world.epoch,
        inspirations: c.world.inspirations,
        colorPhilosophy: c.world.colorPhilosophy,
        pairings: c.world.pairings,
      })),
    );

  const schema = specSchema(candidates);
  const mutationsByWorld = new Map(
    candidates.map((c) => [c.world.id, c.mutations]),
  );

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
          {
            role: "user",
            content: prompt + attachmentNote + candidateBlock + retryNote,
          },
        ],
        temperature: 0.7,
        maxTokens: 2600,
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
      const raw = schema.parse(extractJson(text));
      // Attach the server-sampled mutations — the LLM never sees or echoes
      // them, so it can't corrupt the dice.
      const spec: InterviewSpec = {
        intro: raw.intro,
        questions: raw.questions,
        styleQuestion: raw.styleQuestion,
        styles: raw.styles.map((s) => ({
          ...s,
          accentFontId: s.accentFontId ?? null,
          mutations: mutationsByWorld.get(s.worldId)!,
        })),
      };
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
  const resolved = resolvedAnswers(state);
  if (!resolved) return buildSkipPrompt(false);
  const lines = resolved.pairs.map((p) => `- ${p.question} → ${p.answer}`);

  if (state.v === 1) {
    // Legacy pending rows answered after the upgrade: keep the palette flow.
    if (resolved.palette) {
      lines.push(
        `- Color scheme "${resolved.palette.name}": ${resolved.palette.colors.join(" ")}`,
      );
    }
    return (
      `The user answered the concept interview for their first request (see the conversation above):\n` +
      `${lines.join("\n")}\n\n` +
      `These choices are binding design direction. Build the FIRST version of the app now: ` +
      `apply the chosen direction, define the color scheme's hex values as CSS custom properties and base the design on them, ` +
      `and record the purpose, these decisions and the palette in /CONCEPT.md.`
    );
  }

  if (resolved.style) {
    lines.push(
      `- Design direction: "${resolved.style.name}" — ${resolved.style.vibe}`,
    );
  }
  return (
    `The user answered the concept interview for their first request (see the conversation above):\n` +
    `${lines.join("\n")}\n\n` +
    `These choices are binding. The chosen direction's full design DNA has been written to /DESIGN.md ` +
    `and is provided above under "Design DNA" — build the FIRST version of the app now strictly within it: ` +
    `load its fonts via add_font, define its palette as CSS custom properties, respect its VERBOTEN list, ` +
    `and record the purpose and content decisions in /CONCEPT.md.`
  );
}

/**
 * The build turn's "new request" when the user skipped the interview.
 * `designWritten` = the route already wrote a system-chosen /DESIGN.md.
 */
export function buildSkipPrompt(designWritten: boolean): string {
  if (designWritten) {
    return (
      `The user skipped the concept interview. A design DNA was sampled for this project and written ` +
      `to /DESIGN.md (provided above under "Design DNA") — treat it as the default direction. Build the ` +
      `FIRST version of the app now based on the user's request, within that DNA; adjust it only if the ` +
      `request itself clearly demands a different look, and record content decisions in /CONCEPT.md.`
    );
  }
  return (
    `The user skipped the concept interview. Build the FIRST version of the app now, ` +
    `based directly on their request above; define a distinctive design DNA in /DESIGN.md first ` +
    `(see "Design DNA" in your instructions), make sensible choices yourself and ` +
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
  if (state.status !== "answered") return null;
  const resolved = resolvedAnswers(state);
  if (!resolved) return null;
  const lines = resolved.pairs.map((p) => `${p.question} → ${p.answer}`);
  if (resolved.palette) {
    lines.push(
      `Color scheme "${resolved.palette.name}": ${resolved.palette.colors.join(" ")}`,
    );
  }
  if (resolved.style) {
    lines.push(
      `Design direction "${resolved.style.name}" (${resolved.style.vibe}) — ` +
        `palette ${resolved.style.palette.join(" ")}, fonts ${resolved.style.headingFontId}/${resolved.style.bodyFontId}` +
        `${resolved.style.accentFontId ? `/${resolved.style.accentFontId}` : ""} — full DNA in /DESIGN.md`,
    );
  }
  return `[Concept interview — the user chose:]\n${lines.join("\n")}`;
}
