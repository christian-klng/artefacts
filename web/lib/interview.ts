// The first-prompt concept interview: 3 LLM-generated single-select questions
// plus a style-direction question the user answers by clicking a visual tile
// (v2 — server-sampled "style worlds", LLM-instantiated per project). Older
// projects persisted v1 states (color palettes instead of styles); those rows
// must keep parsing and rendering forever, so everything here is versioned.
// This module is isomorphic (client + server) and deliberately zod-free so the
// interview card doesn't pull zod into the client bundle: it carries the
// types, a defensive parser for the persisted chat row (`message.kind =
// 'interview'`, content = JSON InterviewState), and the answer validation.
// The strict zod schema for the LLM's raw output lives server-side in
// lib/agent/interview.ts.

export type InterviewOption = { id: string; label: string };

export type InterviewQuestion = {
  id: string;
  question: string;
  options: InterviewOption[];
};

// --- v1 (legacy): color palettes ---------------------------------------------

export type InterviewPalette = {
  id: string;
  name: string;
  /** 4–6 hex colors, ordered background → surface → primary → accent → text. */
  colors: string[];
};

export type InterviewSpecV1 = {
  intro: string;
  questions: InterviewQuestion[];
  paletteQuestion: string;
  palettes: InterviewPalette[];
};

export type InterviewAnswersV1 = {
  selections: Record<string, string>;
  paletteId: string;
};

// --- v2 (current): style directions ------------------------------------------

/** Server-sampled per-project variation within a style world's ranges. */
export type StyleMutations = {
  spacingUnit: number;
  typeScale: number;
  radius: string;
};

export type StyleDirection = {
  id: string;
  /** Style-world id from lib/design-worlds.ts. */
  worldId: string;
  /** Project-specific name, in the user's language. */
  name: string;
  /** One-line character sketch, in the user's language. */
  vibe: string;
  /** Exactly 5 hex colors, ordered background → surface → primary → accent → text. */
  palette: string[];
  /** Font-catalog ids (lib/agent/font-catalog.json). */
  headingFontId: string;
  bodyFontId: string;
  accentFontId?: string | null;
  /** Server-sampled; echoed through persistence for /DESIGN.md composition. */
  mutations: StyleMutations;
};

export type InterviewSpec = {
  /** One friendly lead-in sentence, in the user's language. */
  intro: string;
  /** Exactly 3 single-select direction questions. */
  questions: InterviewQuestion[];
  /** Headline for the style-direction question. */
  styleQuestion: string;
  /** Exactly 3 instantiated style directions. */
  styles: StyleDirection[];
};

export type InterviewAnswers = {
  /** questionId → chosen optionId, one entry per question. */
  selections: Record<string, string>;
  styleId: string;
};

// --- versioned state ----------------------------------------------------------

type InterviewStatus = "pending" | "answered" | "skipped";

export type InterviewStateV1 = {
  v: 1;
  status: InterviewStatus;
  spec: InterviewSpecV1;
  answers?: InterviewAnswersV1 | null;
};

export type InterviewStateV2 = {
  v: 2;
  status: InterviewStatus;
  spec: InterviewSpec;
  answers?: InterviewAnswers | null;
};

export type InterviewState = InterviewStateV1 | InterviewStateV2;

/** What the card submits: version-shaped answers or an explicit skip. */
export type InterviewSubmission =
  | InterviewAnswers
  | InterviewAnswersV1
  | { skip: true };

// --- parsing ------------------------------------------------------------------

/** Parses a persisted interview message's JSON content; null if malformed. */
export function parseInterviewState(content: string): InterviewState | null {
  try {
    const raw = JSON.parse(content) as {
      v?: unknown;
      status?: unknown;
      spec?: unknown;
      answers?: unknown;
    };
    const status = raw?.status;
    if (status !== "pending" && status !== "answered" && status !== "skipped") {
      return null;
    }

    if (raw.v === 1 && isSpecV1(raw.spec)) {
      let answers: InterviewAnswersV1 | null = null;
      const a = raw.answers as
        | { selections?: unknown; paletteId?: unknown }
        | null
        | undefined;
      if (a && typeof a === "object" && typeof a.paletteId === "string") {
        const selections = parseSelections(a.selections);
        if (selections) answers = { selections, paletteId: a.paletteId };
      }
      return { v: 1, status, spec: raw.spec, answers };
    }

    if (raw.v === 2 && isSpecV2(raw.spec)) {
      let answers: InterviewAnswers | null = null;
      const a = raw.answers as
        | { selections?: unknown; styleId?: unknown }
        | null
        | undefined;
      if (a && typeof a === "object" && typeof a.styleId === "string") {
        const selections = parseSelections(a.selections);
        if (selections) answers = { selections, styleId: a.styleId };
      }
      return { v: 2, status, spec: raw.spec, answers };
    }

    return null;
  } catch {
    return null;
  }
}

function parseSelections(x: unknown): Record<string, string> | null {
  if (!x || typeof x !== "object") return null;
  const selections: Record<string, string> = {};
  for (const [key, value] of Object.entries(x as Record<string, unknown>)) {
    if (typeof value === "string") selections[key] = value;
  }
  return selections;
}

function isQuestions(x: unknown): x is InterviewQuestion[] {
  return (
    Array.isArray(x) &&
    x.every(
      (q) =>
        q &&
        typeof q.id === "string" &&
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length > 0 &&
        q.options.every(
          (o: InterviewOption) =>
            o && typeof o.id === "string" && typeof o.label === "string",
        ),
    )
  );
}

function isSpecV1(x: unknown): x is InterviewSpecV1 {
  if (!x || typeof x !== "object") return false;
  const s = x as InterviewSpecV1;
  return (
    typeof s.intro === "string" &&
    typeof s.paletteQuestion === "string" &&
    isQuestions(s.questions) &&
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

function isStyle(x: unknown): x is StyleDirection {
  if (!x || typeof x !== "object") return false;
  const s = x as StyleDirection;
  return (
    typeof s.id === "string" &&
    typeof s.worldId === "string" &&
    typeof s.name === "string" &&
    typeof s.vibe === "string" &&
    Array.isArray(s.palette) &&
    s.palette.length >= 4 &&
    s.palette.every((c) => typeof c === "string") &&
    typeof s.headingFontId === "string" &&
    typeof s.bodyFontId === "string" &&
    (s.accentFontId == null || typeof s.accentFontId === "string") &&
    !!s.mutations &&
    typeof s.mutations.spacingUnit === "number" &&
    typeof s.mutations.typeScale === "number" &&
    typeof s.mutations.radius === "string"
  );
}

function isSpecV2(x: unknown): x is InterviewSpec {
  if (!x || typeof x !== "object") return false;
  const s = x as InterviewSpec;
  return (
    typeof s.intro === "string" &&
    typeof s.styleQuestion === "string" &&
    isQuestions(s.questions) &&
    Array.isArray(s.styles) &&
    s.styles.length > 0 &&
    s.styles.every(isStyle)
  );
}

// --- answer validation ----------------------------------------------------------

function allQuestionsAnswered(
  questions: InterviewQuestion[],
  selections: Record<string, string>,
): boolean {
  return questions.every((q) =>
    q.options.some((o) => o.id === selections[q.id]),
  );
}

/** v2: every question answered with a valid option + a valid style. */
export function validateAnswers(
  spec: InterviewSpec,
  selections: Record<string, string>,
  styleId: string,
): boolean {
  if (!spec.styles.some((s) => s.id === styleId)) return false;
  return allQuestionsAnswered(spec.questions, selections);
}

/** v1 (legacy pending rows): valid option per question + a valid palette. */
export function validateAnswersV1(
  spec: InterviewSpecV1,
  selections: Record<string, string>,
  paletteId: string,
): boolean {
  if (!spec.palettes.some((p) => p.id === paletteId)) return false;
  return allQuestionsAnswered(spec.questions, selections);
}

// --- resolution (summaries / prompts / transcripts) ----------------------------

/**
 * The chosen option label per question plus the chosen palette (v1) or style
 * (v2), for summaries, prompts and transcripts. Null when unanswered.
 */
export function resolvedAnswers(state: InterviewState): {
  pairs: { question: string; answer: string }[];
  palette: InterviewPalette | null;
  style: StyleDirection | null;
} | null {
  if (!state.answers) return null;
  const pairs = state.spec.questions.map((q) => ({
    question: q.question,
    answer:
      q.options.find((o) => o.id === state.answers!.selections[q.id])?.label ??
      "—",
  }));
  if (state.v === 1) {
    return {
      pairs,
      palette:
        state.spec.palettes.find((p) => p.id === state.answers!.paletteId) ??
        null,
      style: null,
    };
  }
  return {
    pairs,
    palette: null,
    style: state.spec.styles.find((s) => s.id === state.answers!.styleId) ?? null,
  };
}
