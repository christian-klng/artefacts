import { auth } from "@/auth";
import { getOwnedProject } from "@/lib/projects";
import { listTenantTableMeta, readTablePage } from "@/lib/appdb/provision";

// Read-only data viewer for the builder's OWN project database. Ownership-gated
// (getOwnedProject), so this is the app owner inspecting their app's data — it
// shows ALL rows (row_security off in readTablePage), unlike the end-user data
// API. Two shapes: no `table` param → the table inventory; with `table` → a page
// of rows.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return json({ error: "Unauthorized" }, 401);
  const userId = session.user.id;

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, 400);

  let project;
  try {
    project = await getOwnedProject(projectId, userId);
  } catch {
    return json({ error: "Not found" }, 404);
  }
  if (!project.databaseEnabled) return json({ enabled: false, tables: [] });

  const table = url.searchParams.get("table");
  try {
    if (!table) {
      const tables = await listTenantTableMeta(projectId);
      return json({ enabled: true, tables });
    }
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const page = await readTablePage(projectId, table, limit, offset);
    return json({ enabled: true, table, ...page });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    return json({ error: message }, 400);
  }
}
