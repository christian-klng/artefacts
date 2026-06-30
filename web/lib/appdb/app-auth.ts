import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appUsers } from "@/lib/db/schema";

// End-user auth for GENERATED apps (the "login" the agent wires up). Distinct
// from builder auth (Auth.js): these accounts live in `appUsers`, scoped per
// project, and authenticate on the app's OWN origin (<label>.apps.<domain>),
// where the builder's session cookie is intentionally never sent.
//
// The session is a stateless HMAC token (same shape as preview-token.ts), but
// the signing key is derived per-project from AUTH_SECRET, so a token minted for
// project A is cryptographically invalid for project B — independent of the
// projectId carried in the payload, which the API also cross-checks.

export const APP_SESSION_COOKIE = "artefacts_app_session";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function rootSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

/** Per-project signing key: forging a token needs the server secret AND binds it to one project. */
function projectKey(projectId: string): Buffer {
  return createHmac("sha256", rootSecret())
    .update(`app-session:${projectId}`)
    .digest();
}

function sign(projectId: string, payload: string): string {
  return createHmac("sha256", projectKey(projectId)).update(payload).digest("base64url");
}

/** Mints a session token binding an end-user to a project for `ttlSeconds`. */
export function signAppSession(
  projectId: string,
  appUserId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(`${projectId}:${appUserId}:${exp}`).toString("base64url");
  return `${payload}.${sign(projectId, payload)}`;
}

/** Returns the appUserId iff the token is valid, unexpired, and for `projectId`. */
export function verifyAppSession(
  token: string | null | undefined,
  projectId: string,
): string | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = sign(projectId, payload);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const parts = decoded.split(":");
  if (parts.length !== 3) return null;
  const [tokenProject, appUserId, expStr] = parts;
  if (tokenProject !== projectId) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return appUserId;
}

// --- Account operations -----------------------------------------------------

export type AppUserPublic = { id: string; email: string; name: string | null };

/** Creates an end-user account, or returns an error (e.g. email already taken). */
export async function createAppUser(
  projectId: string,
  email: string,
  password: string,
  name?: string | null,
): Promise<{ user: AppUserPublic } | { error: string }> {
  const normalized = email.trim().toLowerCase();
  const existing = await db.query.appUsers.findFirst({
    where: and(eq(appUsers.projectId, projectId), eq(appUsers.email, normalized)),
  });
  if (existing) return { error: "Diese E-Mail ist bereits registriert." };

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const [row] = await db
      .insert(appUsers)
      .values({ projectId, email: normalized, passwordHash, name: name ?? null })
      .returning({ id: appUsers.id, email: appUsers.email, name: appUsers.name });
    return { user: row };
  } catch {
    // Unique-index race: another signup for the same email landed first.
    return { error: "Diese E-Mail ist bereits registriert." };
  }
}

/** Verifies credentials; returns the public user or null. */
export async function verifyAppCredentials(
  projectId: string,
  email: string,
  password: string,
): Promise<AppUserPublic | null> {
  const normalized = email.trim().toLowerCase();
  const user = await db.query.appUsers.findFirst({
    where: and(eq(appUsers.projectId, projectId), eq(appUsers.email, normalized)),
  });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, email: user.email, name: user.name };
}

/** Looks up an end-user by id (for /me), scoped to the project. */
export async function getAppUser(
  projectId: string,
  appUserId: string,
): Promise<AppUserPublic | null> {
  const user = await db.query.appUsers.findFirst({
    where: and(eq(appUsers.id, appUserId), eq(appUsers.projectId, projectId)),
  });
  return user ? { id: user.id, email: user.email, name: user.name } : null;
}

/** Builds the Set-Cookie header for an app session (host-scoped, httpOnly). */
export function appSessionCookie(
  value: string,
  host: string | null,
  maxAgeSeconds = DEFAULT_TTL_SECONDS,
): string {
  const isLocal = (host ?? "").split(":")[0].endsWith("localhost");
  const secure = isLocal ? "" : " Secure;";
  const maxAge = value ? maxAgeSeconds : 0;
  return `${APP_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge};${secure}`;
}
