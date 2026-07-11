import "server-only";
import { timingSafeEqual } from "node:crypto";

// Bearer-secret check for the internal admin→web API (POST /api/admin/projects).
// The admin panel is a separate app on its own container; it triggers real
// publish/unpublish (which need the builder's backup + thumbnail logic) by
// calling web with this shared secret. Env-only, like BACKUP_CRON_SECRET —
// never surfaced in the app_setting table. Returns false (endpoint closed) when
// the secret is unset, so a misconfigured deploy fails safe rather than exposing
// an unauthenticated publish trigger.

export function verifyAdminApiSecret(
  provided: string | null | undefined,
): boolean {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch; compare lengths first (the length
  // isn't the secret) then run the constant-time byte compare.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
