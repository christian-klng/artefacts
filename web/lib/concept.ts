// The agent keeps internal memory files in the VFS so durable decisions
// survive beyond the recent-chat window: /CONCEPT.md (audience, purpose,
// content choices, explicit wishes & no-gos) and /DESIGN.md (the binding
// design DNA: epoch, typography, color philosophy, grid/shape/motion rules,
// forbidden patterns — pre-filled by the concept interview or written by the
// agent itself). They are real VFS files the agent reads/writes with its
// normal tools, but they are INTERNAL: never served on the app's origin,
// never in the download/export, and never part of the publish signature.
//
// Kept import-free so any layer (server routes, data layer) can use it without
// risking an import cycle.

export const CONCEPT_PATH = "/CONCEPT.md";
export const DESIGN_PATH = "/DESIGN.md";

/** True for VFS paths that are agent-internal and must not reach the shipped app. */
export function isInternalVfsPath(path: string): boolean {
  return path === CONCEPT_PATH || path === DESIGN_PATH;
}
