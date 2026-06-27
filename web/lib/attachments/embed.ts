import "server-only";
import { getAttachmentsData } from "@/lib/attachments";
import { ATTACHMENT_REF } from "./ref";

/**
 * Replaces every `artefact-attachment:<id>` reference in the HTML with the
 * uploaded file as an inline `data:<mime>;base64,…` URI. This is the single
 * place tokens are resolved; it runs at each output boundary (preview serve,
 * published serve, the client render route) so the VFS only ever stores small
 * tokens while the served/downloaded page is self-contained.
 *
 * Always scoped to `projectId`: a token bearing another project's id resolves to
 * nothing and is left untouched — no cross-tenant leak.
 */
export async function expandAttachmentRefs(
  projectId: string,
  html: string,
): Promise<string> {
  const ids = [...new Set([...html.matchAll(ATTACHMENT_REF)].map((m) => m[1]))];
  if (ids.length === 0) return html; // fast path: nothing to expand

  const data = await getAttachmentsData(projectId, ids);
  return html.replace(ATTACHMENT_REF, (token, id) => {
    const a = data.get(id);
    return a ? `data:${a.mimeType};base64,${a.dataBase64}` : token;
  });
}
