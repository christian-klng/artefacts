import { auth } from "@/auth";
import { getOwnedProject, restoreVersion } from "@/lib/projects";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const projectId = body?.projectId;
  const versionId = body?.versionId;
  if (typeof projectId !== "string" || typeof versionId !== "string") {
    return Response.json(
      { error: "projectId and versionId are required" },
      { status: 400 },
    );
  }

  // Ownership check before touching anything.
  await getOwnedProject(projectId, session.user.id);
  // Returns { files, assets } — text files in full, binary assets as metadata.
  const result = await restoreVersion(projectId, versionId);
  return Response.json(result);
}
