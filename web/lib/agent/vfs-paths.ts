import "server-only";
import { readFileRaw } from "@/lib/projects";

// Turns a filename into a safe VFS path under /assets, avoiding collisions.
// Shared by the attachment-embed and stock-photo tools.
export async function assetPath(
  projectId: string,
  filename: string,
  desired?: string,
): Promise<string> {
  if (desired) return desired.startsWith("/") ? desired : `/${desired}`;
  const clean = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+/, "");
  const dot = clean.lastIndexOf(".");
  const base = dot === -1 ? clean : clean.slice(0, dot);
  const ext = dot === -1 ? "" : clean.slice(dot);
  for (let i = 0; i < 100; i += 1) {
    const candidate = `/assets/${base}${i === 0 ? "" : `-${i}`}${ext}`;
    if ((await readFileRaw(projectId, candidate)) === null) return candidate;
  }
  return `/assets/${base}-${Date.now()}${ext}`;
}
