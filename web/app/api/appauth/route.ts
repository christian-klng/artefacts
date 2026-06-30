import { z } from "zod";
import { resolveAppContext } from "@/lib/appdb/app-request";
import {
  APP_SESSION_COOKIE,
  appSessionCookie,
  createAppUser,
  verifyAppCredentials,
  verifyAppSession,
  getAppUser,
  signAppSession,
} from "@/lib/appdb/app-auth";

// Same-origin end-user auth for a generated app (window.artefacts.auth). Runs on
// the app's own origin so its session cookie is host-scoped and never collides
// with the builder's. POST { action } does signup/login/logout; GET returns the
// current end-user (/me). The session id flows into the data API as the RLS
// owner.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const credsSchema = z.object({
  action: z.enum(["signup", "login", "logout"]),
  email: z.email().optional(),
  password: z.string().min(8).optional(),
  name: z.string().max(200).optional(),
});

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function json(data: unknown, status = 200, setCookie?: string): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cache-control": "no-store",
  };
  if (setCookie) headers["set-cookie"] = setCookie;
  return new Response(JSON.stringify(data), { status, headers });
}

export async function GET(request: Request) {
  const resolved = await resolveAppContext(request);
  if ("error" in resolved) return resolved.error;
  const { projectId } = resolved.ctx;

  const token = readCookie(request.headers.get("cookie"), APP_SESSION_COOKIE);
  const appUserId = verifyAppSession(token, projectId);
  if (!appUserId) return json({ user: null });
  const user = await getAppUser(projectId, appUserId);
  return json({ user });
}

export async function POST(request: Request) {
  const resolved = await resolveAppContext(request);
  if ("error" in resolved) return resolved.error;
  const { projectId, databaseEnabled } = resolved.ctx;
  if (!databaseEnabled) {
    return json({ error: "Diese App hat keine Datenbank." }, 400);
  }

  const host = request.headers.get("x-app-host") || request.headers.get("host");

  let body: z.infer<typeof credsSchema>;
  try {
    body = credsSchema.parse(await request.json());
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }

  if (body.action === "logout") {
    return json({ ok: true }, 200, appSessionCookie("", host, 0));
  }

  if (!body.email || !body.password) {
    return json({ error: "E-Mail und Passwort erforderlich." }, 400);
  }

  if (body.action === "signup") {
    const result = await createAppUser(
      projectId,
      body.email,
      body.password,
      body.name,
    );
    if ("error" in result) return json({ error: result.error }, 400);
    const token = signAppSession(projectId, result.user.id);
    return json({ user: result.user }, 200, appSessionCookie(token, host));
  }

  // login
  const user = await verifyAppCredentials(projectId, body.email, body.password);
  if (!user) return json({ error: "E-Mail oder Passwort falsch." }, 401);
  const token = signAppSession(projectId, user.id);
  return json({ user }, 200, appSessionCookie(token, host));
}
