"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects } from "@/lib/schema";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

export type ActionState = { ok?: boolean; error?: string; url?: string };

/** Internal base URL of the builder (web) service. Same compose network. */
function webBaseUrl(): string {
  return process.env.WEB_INTERNAL_URL ?? "http://web:3000";
}

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
 * Publishes or takes an app offline on the owner's behalf. Publishing needs the
 * builder's backup-freeze + OG-thumbnail logic, which only lives in the web app,
 * so we delegate to its internal ADMIN_API_SECRET-gated endpoint rather than
 * writing the `project` row here (a bare published=true would leave no frozen
 * snapshot to serve). The proxy gates /apps, but this writes, so we re-verify.
 */
export async function setPublished(
  projectId: string,
  publish: boolean,
): Promise<ActionState> {
  const unauth = await requireAdmin();
  if (unauth) return unauth;
  const m = getMessages(await resolveLocale()).apps;

  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) return { error: m.errNotConfigured };

  try {
    const res = await fetch(`${webBaseUrl()}/api/admin/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        projectId,
        action: publish ? "publish" : "unpublish",
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return { error: data?.error || m.errActionFailed };
    }
    const data = (await res.json().catch(() => null)) as {
      url?: string;
    } | null;
    revalidatePath("/apps");
    return { ok: true, url: data?.url };
  } catch (error) {
    console.error("setPublished failed:", error);
    return { error: m.errActionFailed };
  }
}

/**
 * Toggles the "Leuchtturm" (landing-page showcase) flag. A pure curatorial
 * admin write, so it's done directly on the shared DB (like coupons/settings) —
 * no builder logic involved. Deliberately does NOT bump updatedAt: featuring an
 * app is not app activity and must not reorder the activity-sorted list.
 */
export async function toggleFeatured(
  projectId: string,
  featured: boolean,
): Promise<ActionState> {
  const unauth = await requireAdmin();
  if (unauth) return unauth;
  const common = getMessages(await resolveLocale()).common;

  try {
    await db
      .update(projects)
      .set({ featured })
      .where(eq(projects.id, projectId));
  } catch (error) {
    console.error("toggleFeatured failed:", error);
    return { error: common.saveFailed };
  }
  revalidatePath("/apps");
  return { ok: true };
}
