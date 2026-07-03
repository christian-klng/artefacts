// The first-prompt concept interview: 3 LLM-generated single-select questions
// plus a fixed color-scheme question the user answers by clicking a palette.
// This module is isomorphic (client + server) and deliberately zod-free so the
// interview card doesn't pull zod into the client bundle: it carries the types,
// a defensive parser for the persisted chat row (`message.kind = 'interview'`,
// content = JSON InterviewState), and the answer validation. The strict zod
// schema for the LLM's raw output lives server-side in lib/agent/interview.ts.

export type InterviewOption = { id: string; label: string };

export type InterviewQuestion = {
  id: string;
  question: string;
  options: InterviewOption[];
};

export type InterviewPalette = {
  id: string;
  name: string;
  /** 4–6 hex colors, ordered background → surface → primary → accent → text. */
  colors: string[];
};

export type InterviewSpec = {
  /** One friendly lead-in sentence, in the user's language. */
  intro: string;
  /** Exactly 3 single-select direction questions. */
  questions: InterviewQuestion[];
  /** Headline for the fixed color-scheme question. */
  paletteQuestion: string;
  palettes: InterviewPalette[];
};

export type InterviewAnswers = {
  /** questionId → chosen optionId, one entry per question. */
  selections: Record<string, string>;
  paletteId: string;
};

export type InterviewState = {
  v: 1;
  status: "pending" | "answered" | "skipped";
  spec: InterviewSpec;
  answers?: InterviewAnswers | null;
};

/** What the card submits: either full answers or an explicit skip. */
export type InterviewSubmission = InterviewAnswers | { skip: true };

/** Parses a persisted interview message's JSON content; null if malformed. */
export function parseInterviewState(content: string): InterviewState | null {
  try {
    const raw = JSON.parse(content) as {
      v?: unknown;
      status?: unknown;
      spec?: unknown;
      answers?: unknown;
    };
    if (raw?.v !== 1) return null;
    const status = raw.status;
    if (status !== "pending" && status !== "answered" && status !== "skipped") {
      return null;
    }
    if (!isSpec(raw.spec)) return null;

    let answers: InterviewAnswers | null = null;
    const a = raw.answers as
      | { selections?: unknown; paletteId?: unknown }
      | null
      | undefined;
    if (
      a &&
      typeof a === "object" &&
      typeof a.paletteId === "string" &&
      a.selections &&
      typeof a.selections === "object"
    ) {
      const selections: Record<string, string> = {};
      for (const [key, value] of Object.entries(
        a.selections as Record<string, unknown>,
      )) {
        if (typeof value === "string") selections[key] = value;
      }
      answers = { selections, paletteId: a.paletteId };
    }
    return { v: 1, status, spec: raw.spec, answers };
  } catch {
    return null;
  }
}

function isSpec(x: unknown): x is InterviewSpec {
  if (!x || typeof x !== "object") return false;
  const s = x as InterviewSpec;
  return (
    typeof s.intro === "string" &&
    typeof s.paletteQuestion === "string" &&
    Array.isArray(s.questions) &&
    s.questions.every(
      (q) =>
        q &&
        typeof q.id === "string" &&
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length > 0 &&
        q.options.every(
          (o) => o && typeof o.id === "string" && typeof o.label === "string",
        ),
    ) &&
    Array.isArray(s.palettes) &&
    s.palettes.length > 0 &&
    s.palettes.every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        Array.isArray(p.colors) &&
        p.colors.every((c) => typeof c === "string"),
    )
  );
}

/** True when every question is answered with a valid option + valid palette. */
export function validateAnswers(
  spec: InterviewSpec,
  selections: Record<string, string>,
  paletteId: string,
): boolean {
  if (!spec.palettes.some((p) => p.id === paletteId)) return false;
  return spec.questions.every((q) =>
    q.options.some((o) => o.id === selections[q.id]),
  );
}

/** The chosen option label per question + palette, for summaries/prompts. */
export function resolvedAnswers(
  spec: InterviewSpec,
  answers: InterviewAnswers,
): {
  pairs: { question: string; answer: string }[];
  palette: InterviewPalette | null;
} {
  const pairs = spec.questions.map((q) => ({
    question: q.question,
    answer:
      q.options.find((o) => o.id === answers.selections[q.id])?.label ?? "—",
  }));
  const palette =
    spec.palettes.find((p) => p.id === answers.paletteId) ?? null;
  return { pairs, palette };
}
