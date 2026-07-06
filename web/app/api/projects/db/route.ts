import { auth } from "@/auth";
import { getOwnedProject } from "@/lib/projects";
import {
  listTenantTableMeta,
  readTablePage,
  updateTableRow,
  deleteTableRow,
} from "@/lib/appdb/provision";

// Data viewer + row editor for the builder's OWN project database. Ownership-
// gated (getOwnedProject), so this is the app owner managing their app's data —
// it sees/edits ALL rows (row_security off in provision.ts), unlike the end-user
// data API. GET reads (inventory / a page of rows); PATCH updates one row by its
// primary key; DELETE removes one row by its primary key.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Resolves the caller and asserts they own the project. On success returns the
// owned project's DB flag; otherwise an error Response ready to return.
async function requireOwner(
  projectId: string | null | undefined,
): Promise<{ error: Response } | { databaseEnabled: boolean }> {
  const session = await auth();
  if (!session?.user) return { error: json({ error: "Unauthorized" }, 401) };
  if (!projectId) return { error: json({ error: "projectId is required" }, 400) };
  try {
    const project = await getOwnedProject(projectId, session.user.id);
    return { databaseEnabled: project.databaseEnabled };
  } catch {
    return { error: json({ error: "Not found" }, 404) };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const gate = await requireOwner(projectId);
  if ("error" in gate) return gate.error;
  if (!gate.databaseEnabled) return json({ enabled: false, tables: [] });

  const table = url.searchParams.get("table");
  try {
    if (!table) {
      const tables = await listTenantTableMeta(projectId!);
      return json({ enabled: true, tables });
    }
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const page = await readTablePage(projectId!, table, limit, offset);
    return json({ enabled: true, table, ...page });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    return json({ error: message }, 400);
  }
}

type WriteBody = {
  projectId?: string;
  table?: string;
  pk?: Record<string, unknown>;
  values?: Record<string, unknown>;
};

export async function PATCH(request: Request) {
  let body: WriteBody;
  try {
    body = (await request.json()) as WriteBody;
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }
  const gate = await requireOwner(body.projectId);
  if ("error" in gate) return gate.error;
  if (!gate.databaseEnabled) return json({ error: "Diese App hat keine Datenbank." }, 400);
  if (!body.table || !body.pk || !body.values) {
    return json({ error: "table, pk und values sind erforderlich." }, 400);
  }
  try {
    const row = await updateTableRow(body.projectId!, body.table, body.pk, body.values);
    if (!row) return json({ error: "Zeile nicht gefunden." }, 404);
    return json({ row });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Update fehlgeschlagen." }, 400);
  }
}

export async function DELETE(request: Request) {
  let body: WriteBody;
  try {
    body = (await request.json()) as WriteBody;
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }
  const gate = await requireOwner(body.projectId);
  if ("error" in gate) return gate.error;
  if (!gate.databaseEnabled) return json({ error: "Diese App hat keine Datenbank." }, 400);
  if (!body.table || !body.pk) {
    return json({ error: "table und pk sind erforderlich." }, 400);
  }
  try {
    const deleted = await deleteTableRow(body.projectId!, body.table, body.pk);
    if (deleted === 0) return json({ error: "Zeile nicht gefunden." }, 404);
    return json({ deleted });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Löschen fehlgeschlagen." }, 400);
  }
}
