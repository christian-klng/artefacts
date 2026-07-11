"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

export type ActionState = { ok?: boolean; error?: string };

async function requireAdmin(): Promise<{ error: string } | null> {
  const session = await verifySession(
    (await cookies()).get(COOKIE_NAME)?.value,
  );
  if (!session) {
    return { error: getMessages(await resolveLocale()).common.notLoggedIn };
  }
  return null;
}

/**
 * Grants or revokes the builder-side admin flag (user.is_admin). A pure flag on
 * the shared DB — the builder reads it FRESH on each request (web/lib/admin.ts)
 * to allow read-only cross-user access, so a change takes effect on the user's
 * next request without a redeploy. Mirrors the apps toggleFeatured pattern.
 */
export async function setAdmin(
  userId: string,
  isAdmin: boolean,
): Promise<ActionState> {
  const unauth = await requireAdmin();
  if (unauth) return unauth;
  const common = getMessages(await resolveLocale()).common;

  try {
    await db.update(users).set({ isAdmin }).where(eq(users.id, userId));
  } catch (error) {
    console.error("setAdmin failed:", error);
    return { error: common.saveFailed };
  }
  revalidatePath("/users");
  return { ok: true };
}
