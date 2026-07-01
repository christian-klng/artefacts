import "server-only";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";

// DB-backed operational settings (see the `app_setting` table). Values are edited
// in the admin app and OVERRIDE the matching env var, so e.g. the build model or
// the billing margin can change without a redeploy. Read with precedence:
//
//   DB value (if non-blank) > process.env[key] (if non-blank) > code fallback
//
// The DB key mirrors the env var name, so one `key` covers both sources. Cached
// in-process with a short TTL so admin edits take effect within ~TTL without
// hitting the DB on every model lookup / mail send. The admin app writes to a
// different process, so the only propagation delay is this TTL.

const TTL_MS = 30_000;

type Cache = { at: number; map: Map<string, string> };
const globalForSettings = globalThis as unknown as {
  appSettingsCache?: Cache;
};

async function loadSettings(): Promise<Map<string, string>> {
  const cached = globalForSettings.appSettingsCache;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.map;

  try {
    const rows = await db
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings);
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.value != null && row.value.trim() !== "") {
        map.set(row.key, row.value);
      }
    }
    globalForSettings.appSettingsCache = { at: Date.now(), map };
    return map;
  } catch (error) {
    // A settings read must never break a request (nor block signup / billing /
    // the agent). Fall back to the last good cache, else empty — env/defaults
    // then take over via settingString below.
    console.error("Failed to load app settings:", error);
    return cached?.map ?? new Map();
  }
}

/**
 * Resolves a setting as a string: DB override > env var of the same name >
 * `fallback`. A blank value in either source is treated as unset.
 */
export async function settingString(
  key: string,
  fallback: string,
): Promise<string> {
  const map = await loadSettings();
  const dbVal = map.get(key);
  if (dbVal != null && dbVal.trim() !== "") return dbVal;
  const env = process.env[key];
  if (env != null && env.trim() !== "") return env;
  return fallback;
}

/** Same precedence as {@link settingString}, parsed as a finite number. */
export async function settingNumber(
  key: string,
  fallback: number,
): Promise<number> {
  const raw = await settingString(key, "");
  if (raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
