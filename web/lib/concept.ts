// The agent keeps internal memory files in the VFS so durable decisions
// survive beyond the recent-chat window: /CONCEPT.md (audience, purpose,
// content choices, explicit wishes & no-gos) and /DESIGN.md (the binding
// design DNA: epoch, typography, color philosophy, grid/shape/motion rules,
// forbidden patterns — pre-filled by the concept interview or written by the
// agent itself). They are real VFS files the agent reads/writes with its normal
// tools. They ARE shown READ-ONLY in the workspace code tree (via getClientFiles'
// separate `internal` channel) so the user can read the concept/design, but they
// are INTERNAL to the shipped app: never served on the app's origin, never in the
// download/export, and never part of the publish signature.
//
// Kept import-free so any layer (server routes, data layer) can use it without
// risking an import cycle.

export const CONCEPT_PATH = "/CONCEPT.md";
export const DESIGN_PATH = "/DESIGN.md";
// Auto-maintained SEO/GEO status report for websites — server-composed from a
// measured checklist (lib/seo-checklist.ts), never written by the agent. Internal
// exactly like CONCEPT/DESIGN: read-only in the workspace tree, but never served,
// exported, or part of the publish signature.
export const SEO_GEO_PATH = "/SEO_GEO.md";

/** True for VFS paths that are agent-internal and must not reach the shipped app. */
export function isInternalVfsPath(path: string): boolean {
  return (
    path === CONCEPT_PATH || path === DESIGN_PATH || path === SEO_GEO_PATH
  );
}
