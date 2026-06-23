import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, short-lived token that authorizes viewing a project's preview on its
// `preview-<id>.apps.<domain>` origin. The builder is authenticated on the main
// domain, but its session cookie is NOT sent to the apps sub-zone (that
// separation is intentional), so we cannot use the session to gate previews
// cross-origin. Instead the builder mints this HMAC token server-side and puts
// it in the iframe URL; the serving route verifies it. No DB lookup, no shared
// cookie — the secret never leaves the server.

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

/** Mints a token granting preview access to `projectId` for `ttlSeconds`. */
export function signPreviewToken(
  projectId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = b64url(Buffer.from(`${projectId}:${exp}`));
  return `${payload}.${sign(payload)}`;
}

/** Returns the projectId if the token is valid and unexpired, else null. */
export function verifyPreviewToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = sign(payload);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  // timingSafeEqual throws on length mismatch — guard first.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const sep = decoded.lastIndexOf(":");
  if (sep <= 0) return null;
  const projectId = decoded.slice(0, sep);
  const exp = Number(decoded.slice(sep + 1));
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return projectId;
}
