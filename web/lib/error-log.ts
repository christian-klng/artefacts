import "server-only";
import { db } from "@/lib/db";
import { errorLogs } from "@/lib/db/schema";

// Persists caught server-side failures to the `error_log` table so the admin
// panel's /logs view can surface them without SSH access to the VPS. Deliberately
// best-effort: logging must NEVER break the request it is reporting on, so every
// write is wrapped and a failure only falls back to console.error. See the
// error_log table in lib/db/schema.ts.

type ErrorScope =
  | "restore"
  | "agent"
  | "stripe-webhook"
  | "cron-backup"
  | "publish"
  | (string & {}); // allow new slugs without a schema change

type ErrorMeta = {
  projectId?: string | null;
  userId?: string | null;
  /** Extra structured context; JSON-stringified into the `context` column. */
  context?: Record<string, unknown>;
};

/**
 * Records one error. `error` is typically the caught exception; message + stack
 * are extracted defensively (non-Error throws become their String() form). Always
 * also console.errors so the container log keeps the full trace as a backup.
 */
export async function logError(
  scope: ErrorScope,
  error: unknown,
  meta: ErrorMeta = {},
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;
  // Always mirror to stdout — cheap, and the source of truth if the DB write
  // below is the thing that's failing.
  console.error(`[${scope}]`, message, meta.context ?? "");
  try {
    await db.insert(errorLogs).values({
      scope,
      projectId: meta.projectId ?? null,
      userId: meta.userId ?? null,
      message,
      stack,
      context: meta.context ? JSON.stringify(meta.context) : null,
    });
  } catch (e) {
    // The log table is unreachable — don't let that mask the original error.
    console.error("[error-log] failed to persist error:", e);
  }
}
