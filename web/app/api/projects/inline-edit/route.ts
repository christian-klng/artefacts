import { auth } from "@/auth";
import { getAccessibleProject, readFile, writeFile } from "@/lib/projects";
import {
  locateEditable,
  escapeEditableText,
  normalizeForCompare,
} from "@/lib/inline-edit";

// Persists a single inline text edit made in the live preview (see
// lib/inline-edit.ts + components/sandpack-workspace.tsx). The preview iframe
// runs on the app sub-zone origin and cannot carry the builder session, so the
// edit is relayed to the parent (builder origin) via postMessage and saved here
// with the owner's session — never from the iframe directly.
//
// Deliberately LIGHTWEIGHT: just writes /index.html. No per-edit backup or OG
// thumbnail/SEO refresh (the next agent turn or publish handles those). The
// integrity guarantee is the `oldText` re-verification: we re-walk the STORED
// source and only splice when the N-th editable element still holds the text the
// user started from — so a stale ordinal (e.g. an agent turn ran in between) or a
// mis-scoped range is rejected, never applied.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bounds the write so a crafted message can't bloat the file.
const MAX_TEXT = 20_000;

function bad(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return bad(401, "unauthorized");
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad(400, "invalid_json");
  }
  const { projectId, ordinal, oldText, newText } = (body ?? {}) as {
    projectId?: unknown;
    ordinal?: unknown;
    oldText?: unknown;
    newText?: unknown;
  };
  if (typeof projectId !== "string" || !projectId) return bad(400, "projectId_required");
  if (typeof ordinal !== "number" || !Number.isInteger(ordinal) || ordinal < 0)
    return bad(400, "ordinal_invalid");
  if (typeof oldText !== "string" || typeof newText !== "string")
    return bad(400, "text_invalid");
  if (newText.length > MAX_TEXT) return bad(413, "text_too_long");

  // Owner ONLY — an admin's read-only view must not write.
  let isOwner = false;
  try {
    ({ isOwner } = await getAccessibleProject(projectId, userId));
  } catch {
    return bad(404, "not_found");
  }
  if (!isOwner) return bad(403, "forbidden");

  const html = await readFile(projectId, "/index.html");
  if (html == null) return bad(404, "no_index");

  const loc = locateEditable(html, ordinal);
  // 409 = the preview is out of sync with the stored source (structure changed);
  // the client reverts the element and can reload for a fresh set of ordinals.
  if (!loc) return bad(409, "stale");
  if (normalizeForCompare(loc.text) !== normalizeForCompare(oldText))
    return bad(409, "stale");

  const updated =
    html.slice(0, loc.innerStart) +
    escapeEditableText(newText) +
    html.slice(loc.innerEnd);
  await writeFile(projectId, "/index.html", updated);

  return Response.json({ content: updated });
}
