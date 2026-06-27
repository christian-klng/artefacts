// Placeholder the agent writes into src/href to reference an uploaded file, e.g.
// <img src="artefact-attachment:0f9c…">. It is materialized into an inline data
// URI at every output boundary (see lib/attachments/embed.ts). This module is
// intentionally free of server-only deps so the client can detect refs too.

// ids are UUIDs.
export const ATTACHMENT_REF =
  /artefact-attachment:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;

/** True if the HTML contains at least one attachment reference to expand. */
export function hasAttachmentRefs(html: string): boolean {
  // Fresh lastIndex each call (the regex is global, so test() is stateful).
  ATTACHMENT_REF.lastIndex = 0;
  return ATTACHMENT_REF.test(html);
}
