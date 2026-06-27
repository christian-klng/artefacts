// The agent keeps a short design-memory file in the VFS so durable decisions
// (audience, purpose, design/content choices, explicit wishes & no-gos) survive
// beyond the recent-chat window. It is a real VFS file the agent reads/writes
// with its normal tools, but it is INTERNAL: never served on the app's origin,
// never in the download/export, and never part of the publish signature.
//
// Kept import-free so any layer (server routes, data layer) can use it without
// risking an import cycle.

export const CONCEPT_PATH = "/CONCEPT.md";

/** True for VFS paths that are agent-internal and must not reach the shipped app. */
export function isInternalVfsPath(path: string): boolean {
  return path === CONCEPT_PATH;
}
