// Composes the /DESIGN.md design-DNA file from a style world + the chosen
// (LLM-instantiated) style direction — a deterministic template, deliberately
// NO extra LLM call. The route writes the result into the VFS before the
// first build turn; app/api/agent/route.ts injects it into every later turn.
import "server-only";
import type { DesignWorld } from "@/lib/design-worlds";
import type { StyleDirection, StyleMutations } from "@/lib/interview";
import { getFont } from "./fonts";

// The global anti-canon, restated inside the DNA so it survives even if the
// system-prompt section ever changes. Kept aligned with system-prompt.ts.
const GLOBAL_FORBIDDEN = [
  "Inter or an interchangeable system sans as the whole typography",
  "the purple/indigo gradient hero with floating blobs",
  "uniform 12–24px border-radius on every card and button",
  "the same soft drop shadow on everything",
  "a three-feature-card row as the reflex page structure",
  '"Welcome to …" filler copy and emoji standing in for UI icons',
];

const PALETTE_ROLES = ["background", "surface", "primary", "accent", "text"];

function fontLine(role: string, fontId: string): string {
  const font = getFont(fontId);
  const family = font ? font.family : fontId;
  const stack = font ? `'${font.family}', ${font.fallback}` : `'${fontId}'`;
  return `- ${role}: **${family}** (catalog id \`${fontId}\`) — use as \`font-family: ${stack};\``;
}

function sharedSections(world: DesignWorld, mutations: StyleMutations): string[] {
  return [
    `## Layout & spacing\n${world.grid}\n- Base spacing unit: **${mutations.spacingUnit}px** — derive all margins/paddings/gaps as multiples of it.\n- Type scale ratio: **${mutations.typeScale}** (each heading level ≈ ${mutations.typeScale}× the previous size).`,
    `## Shape\n${world.shape}\n- Corner radius for this project: **${mutations.radius}**.`,
    `## Motion\n${world.motion}\nAlways honor \`prefers-reduced-motion\`.`,
    `## VERBOTEN (never in this design)\n${[...world.forbidden, ...GLOBAL_FORBIDDEN]
      .map((f) => `- ${f}`)
      .join("\n")}`,
  ];
}

/**
 * The full DNA for a chosen, instantiated style direction.
 * `systemChosen` marks the skip path (the user didn't pick it themselves).
 */
export function composeDesignMd(
  world: DesignWorld,
  style: StyleDirection,
  { systemChosen = false }: { systemChosen?: boolean } = {},
): string {
  const paletteLines = style.palette
    .map((hex, i) => `- ${PALETTE_ROLES[i] ?? `color-${i + 1}`}: \`${hex}\``)
    .join("\n");
  const fonts = [
    fontLine("Headings", style.headingFontId),
    fontLine("Body", style.bodyFontId),
    ...(style.accentFontId ? [fontLine("Accent", style.accentFontId)] : []),
  ].join("\n");

  return [
    `# Design DNA — ${style.name}`,
    `> ${style.vibe}`,
    systemChosen
      ? `_(Direction chosen by the system — the user skipped the concept interview. Keep it unless the user asks for a different look.)_`
      : null,
    `## Epoch & inspiration\nDesign language: **${world.name}** — ${world.epoch}.\nDraw from: ${world.inspirations.join(", ")}. Channel the character, never copy a specific site.`,
    `## Typography\n${fonts}\nLoad exactly these via \`add_font\` (2–4 cuts each) and inline the returned @font-face CSS. Typography carries this design's identity — no other families.`,
    `## Color philosophy\n${world.colorPhilosophy}\nBinding palette (define as CSS custom properties \`--color-bg\`, \`--color-surface\`, \`--color-primary\`, \`--color-accent\`, \`--color-text\` and derive the design from them; fine-tune shades only for contrast/accessibility):\n${paletteLines}`,
    ...sharedSections(world, style.mutations),
  ]
    .filter((s): s is string => s !== null)
    .join("\n\n");
}

/**
 * A leaner DNA when no instantiated style exists (interview generation
 * failed): world rules + sampled mutations; the agent derives the concrete
 * palette from the color philosophy itself.
 */
export function composeFallbackDesignMd(
  world: DesignWorld,
  mutations: StyleMutations,
): string {
  const pairing = world.pairings[0];
  const fonts = [
    fontLine("Headings", pairing.heading),
    fontLine("Body", pairing.body),
    ...(pairing.accent ? [fontLine("Accent", pairing.accent)] : []),
  ].join("\n");

  return [
    `# Design DNA — ${world.name}`,
    `> ${world.blurb}`,
    `_(Direction sampled by the system for this project. Keep it unless the user asks for a different look.)_`,
    `## Epoch & inspiration\n${world.epoch}.\nDraw from: ${world.inspirations.join(", ")}. Channel the character, never copy a specific site.`,
    `## Typography\n${fonts}\nLoad exactly these via \`add_font\` (2–4 cuts each) and inline the returned @font-face CSS.`,
    `## Color philosophy\n${world.colorPhilosophy}\nDerive a concrete 5-color palette from this (background, surface, primary, accent, text), define it as CSS custom properties (\`--color-bg\` …), and record the hex values here in /DESIGN.md.`,
    ...sharedSections(world, mutations),
  ].join("\n\n");
}
