import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Whether a builder user is a platform admin (users.is_admin).
 *
 * Read FRESH from the DB on every call — deliberately NOT carried on the
 * JWT/session, so a demotion takes effect immediately (a stale token can't keep
 * access) and a promotion needs no re-login. Wrapped in React `cache()` so the
 * several callers within one request (the /app layout, the gallery page,
 * getAccessibleProject) share a single indexed PK read — negligible next to the
 * page's existing queries.
 *
 * Admin access is READ-ONLY: this only widens the ownership gate on VIEW routes
 * (see getAccessibleProject in lib/projects.ts). Every write path stays strictly
 * owner-scoped via getOwnedProject.
 */
export const isAdminUser = cache(async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { isAdmin: true },
  });
  return row?.isAdmin ?? false;
});
