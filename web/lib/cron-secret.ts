import "server-only";
import { timingSafeEqual } from "node:crypto";

// Bearer-secret check for internal cron endpoints (e.g. the daily backup route).
// Env-only secret, like AUTH_SECRET — never surfaced in the app_setting table.
// Returns false (endpoint closed) when the secret is unset, so a misconfigured
// deploy fails safe rather than exposing an unauthenticated backup trigger.

export function verifyCronSecret(provided: string | null | undefined): boolean {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch; compare lengths first (the length
  // isn't the secret) then run the constant-time byte compare.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
