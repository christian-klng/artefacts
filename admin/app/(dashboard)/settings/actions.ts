"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/schema";
import { SETTING_KEYS } from "./fields";

export type SaveState = { ok?: boolean; error?: string };

/**
 * Upserts every editable setting from the form. The proxy already gates
 * /settings, but this is a write, so we re-verify the admin session here as
 * defense in depth. A blank value is stored as-is — the builder treats blank as
 * "fall back to env / default" (web/lib/settings.ts).
 */
export async function saveSettings(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await verifySession(
    (await cookies()).get(COOKIE_NAME)?.value,
  );
  if (!session) return { error: "Nicht angemeldet." };

  try {
    const now = new Date();
    for (const key of SETTING_KEYS) {
      const value = String(formData.get(key) ?? "").trim();
      await db
        .insert(appSettings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedAt: now },
        });
    }
  } catch (error) {
    console.error("Failed to save settings:", error);
    return { error: "Speichern fehlgeschlagen." };
  }

  revalidatePath("/settings");
  return { ok: true };
}
