import { eq } from "drizzle-orm";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { verifyDevApiSecret } from "@/lib/mcp/dev-api-secret";
import { buildMcpServer } from "@/lib/mcp/server";

// External MCP interface: lets a support operator point their OWN AI (Claude
// Code, etc.) at ONE user's app to help build it — WITHOUT spending the user's
// credit and WITHOUT touching the user's chat (mutations go straight to the VFS
// + an operator-side audit row; see lib/mcp/*). Gated solely by the shared
// DEV_API_SECRET bearer, pinned to one project via ?app=<projectId>. Not a page
// and not user-authenticated, exactly like /api/admin/projects and the Stripe
// webhook. Runs in the web container so it reaches the DB + all lib/* helpers
// directly; excluded from the proxy matcher (/api/*), so it is served on the
// real builder host with the right method routing.
//
// Add to Claude Code:
//   claude mcp add --transport http artefacts-app \
//     "https://<builder-host>/api/mcp?app=<PROJECT_ID>" \
//     --header "Authorization: Bearer $DEV_API_SECRET"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!verifyDevApiSecret(provided)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // The pinned app: ?app=<projectId> (accept ?projectId= too). One key+id pair
  // operates on exactly this project; a different app means a new connection.
  const url = new URL(request.url);
  const projectId =
    url.searchParams.get("app") ?? url.searchParams.get("projectId") ?? "";
  if (!projectId) {
    return Response.json(
      { error: "Missing ?app=<projectId>" },
      { status: 400 },
    );
  }

  // Resolve by id only (cross-user: the operator acts on any project) — the one
  // deliberate relaxation of tenant scoping, hard-gated by the secret above. A
  // malformed uuid makes the query throw → caught → 404 (can't probe existence).
  const project = await db.query.projects
    .findFirst({
      where: eq(projects.id, projectId),
      columns: {
        id: true,
        userId: true,
        name: true,
        published: true,
        databaseEnabled: true,
        publishSlug: true,
      },
    })
    .catch(() => null);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Optional free-text attribution for the audit log (the shared secret has no
  // identity of its own).
  const actor = request.headers.get("x-actor");

  // Stateless: a fresh server + transport per request (no session state to
  // pin), JSON responses (simple request/response, no long-lived SSE stream).
  const server = buildMcpServer(project, actor);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  transport.onclose = () => {
    void server.close().catch(() => {});
  };
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
