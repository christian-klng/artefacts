import { auth } from "@/auth";
import { getOwnedProject, readFileRaw } from "@/lib/projects";
import { contentTypeFor } from "@/lib/vfs";

// Serves the raw bytes of ONE VFS file to the builder UI (ownership-gated), so
// the read-only code viewer can render binary image assets (e.g. the auto OG
// thumbnail /assets/og-thumbnail.png, embedded logos, stock photos) instead of a
// text placeholder. The client never gets base64 in the SSE stream — it fetches
// the picture here on demand. Same-origin, no preview token needed.
//
// The URL carries the asset's content hash as `v=` so the cache is safe to make
// immutable: a regenerated thumbnail gets a new hash → a new URL → a fresh fetch.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const path = url.searchParams.get("path");
  if (!projectId || !path) {
    return new Response("projectId and path are required", { status: 400 });
  }
  try {
    await getOwnedProject(projectId, userId); // ownership guard
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const file = await readFileRaw(projectId, path);
  if (!file) return new Response("Not found", { status: 404 });

  const body =
    file.encoding === "base64"
      ? new Uint8Array(Buffer.from(file.content, "base64"))
      : file.content;
  return new Response(body, {
    headers: {
      "content-type": contentTypeFor(path, file.mimeType),
      // Hash-busted URL (?v=), so immutable is safe and reopening the same file
      // (or switching back to it) doesn't refetch.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
