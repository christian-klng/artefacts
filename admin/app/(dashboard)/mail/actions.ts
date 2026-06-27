"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailTemplates } from "@/lib/schema";

export type SaveState = { ok?: boolean; error?: string };

const KEYS = ["welcome", "reset"] as const;

/**
 * Upserts both mail templates from the form. The proxy already gates /mail, but
 * this is a write, so we re-verify the admin session here as defense in depth.
 * A blank field is saved as-is — the builder treats blank as "use the default".
 */
export async function saveMailTemplates(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await verifySession(
    (await cookies()).get(COOKIE_NAME)?.value,
  );
  if (!session) return { error: "Nicht angemeldet." };

  try {
    const now = new Date();
    for (const key of KEYS) {
      const subject = String(formData.get(`${key}_subject`) ?? "");
      const html = String(formData.get(`${key}_html`) ?? "");
      await db
        .insert(mailTemplates)
        .values({ key, subject, html, updatedAt: now })
        .onConflictDoUpdate({
          target: mailTemplates.key,
          set: { subject, html, updatedAt: now },
        });
    }
  } catch (error) {
    console.error("Failed to save mail templates:", error);
    return { error: "Speichern fehlgeschlagen." };
  }

  revalidatePath("/mail");
  return { ok: true };
}
