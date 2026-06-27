import { zipSync, strToU8 } from "fflate";
import { auth } from "@/auth";
import { getOwnedProject, listFiles } from "@/lib/projects";

// Builds a ZIP of the project's whole virtual filesystem (text + binary assets)
// so the user gets exactly the files in the Code tree to run/edit locally.
// Ownership-gated.
export const runtime = "nodejs";

function zipName(name: string): string {
  const clean = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${clean || "app"}.zip`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return new Response("projectId is required", { status: 400 });

  let project;
  try {
    project = await getOwnedProject(projectId, userId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const all = await listFiles(projectId);
  const entries: Record<string, Uint8Array> = {};
  for (const f of all) {
    // Strip the leading "/" so the zip has clean relative paths.
    const name = f.path.replace(/^\//, "");
    entries[name] =
      f.encoding === "base64"
        ? new Uint8Array(Buffer.from(f.content, "base64"))
        : strToU8(f.content);
  }

  const zipped = zipSync(entries, { level: 6 });
  return new Response(new Uint8Array(zipped), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zipName(project.name)}"`,
      "cache-control": "no-store",
    },
  });
}
