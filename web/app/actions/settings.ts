"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n";

// Persist the user's language choice from the account settings. Writes BOTH the
// durable per-user DB column (used cross-device and to localise their emails) and
// the NEXT_LOCALE cookie (the fast read path that lib/locale.ts checks first, so
// the change takes effect on the next render without waiting for a fresh JWT).
export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;

  const session = await auth();
  if (session?.user?.id) {
    await db
      .update(users)
      .set({ locale })
      .where(eq(users.id, session.user.id));
  }

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
