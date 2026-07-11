import "server-only";
import { timingSafeEqual } from "node:crypto";

// Bearer-secret check for the external developer/admin MCP interface
// (POST /api/mcp — lib/mcp/*). A support operator points their OWN AI (Claude
// Code, etc.) at a user's app through this endpoint to help build it WITHOUT
// spending the user's credit and WITHOUT writing to the user's chat. The shared
// DEV_API_SECRET is the only gate, so the whole surface is CLOSED when it is
// unset — a misconfigured deploy fails safe rather than exposing an
// unauthenticated cross-user editing bridge. Env-only, exactly like
// ADMIN_API_SECRET / BACKUP_CRON_SECRET; never surfaced in the app_setting table.
export function verifyDevApiSecret(
  provided: string | null | undefined,
): boolean {
  const secret = process.env.DEV_API_SECRET;
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch; compare lengths first (the length
  // isn't the secret) then run the constant-time byte compare.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
