import { z } from "zod";
import { pool } from "@/lib/db";
import { resolveAppContext } from "@/lib/appdb/app-request";
import { tenantNames } from "@/lib/appdb/provision";
import { APP_SESSION_COOKIE, verifyAppSession } from "@/lib/appdb/app-auth";
import {
  buildSelect,
  buildInsert,
  buildUpdate,
  buildDelete,
  type Filter,
} from "@/lib/appdb/sql";
import { runTenantQuery } from "@/lib/appdb/exec";

// Same-origin data API for a generated app. The app's injected SDK
// (window.artefacts.db) POSTs a constrained query here; we map it onto the
// injection-safe builders in sql.ts and run it under the project's role + RLS
// via runTenantQuery. Every value travels as a bound parameter, every
// identifier is allowlist-validated — the client never sends raw SQL.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filterSchema = z.object({
  column: z.string(),
  op: z.enum(["eq", "neq", "lt", "lte", "gt", "gte", "like", "ilike", "in"]),
  value: z.unknown(),
});

const bodySchema = z.object({
  table: z.string(),
  op: z.enum(["select", "insert", "update", "delete"]),
  columns: z.array(z.string()).optional(),
  where: z.array(filterSchema).optional(),
  values: z.record(z.string(), z.unknown()).optional(),
  orderBy: z
    .object({ column: z.string(), dir: z.enum(["asc", "desc"]).optional() })
    .optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const resolved = await resolveAppContext(request);
  if ("error" in resolved) return resolved.error;
  const { projectId, databaseEnabled } = resolved.ctx;
  if (!databaseEnabled) {
    return json({ error: "Diese App hat keine Datenbank." }, 400);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }

  // End-user identity drives RLS; absent for anonymous callers.
  const sessionToken = readCookie(
    request.headers.get("cookie"),
    APP_SESSION_COOKIE,
  );
  const endUserId = verifyAppSession(sessionToken, projectId);

  const { schema, role } = tenantNames(projectId);
  const where = body.where as Filter[] | undefined;

  try {
    let built;
    switch (body.op) {
      case "select":
        built = buildSelect({
          table: body.table,
          columns: body.columns,
          where,
          orderBy: body.orderBy,
          limit: body.limit,
          offset: body.offset,
        });
        break;
      case "insert":
        if (!body.values) return json({ error: "values fehlt." }, 400);
        built = buildInsert({ table: body.table, values: body.values });
        break;
      case "update":
        if (!body.values) return json({ error: "values fehlt." }, 400);
        built = buildUpdate({ table: body.table, values: body.values, where });
        break;
      case "delete":
        built = buildDelete({ table: body.table, where });
        break;
    }
    const rows = await runTenantQuery(pool, { schema, role, endUserId }, built);
    return json({ rows });
  } catch (e) {
    // Surfaces the app developer's own schema errors (bad table/column, RLS
    // denial). It's their schema, so this is safe and useful; never a 500.
    const message = e instanceof Error ? e.message : "Query fehlgeschlagen.";
    return json({ error: message }, 400);
  }
}
