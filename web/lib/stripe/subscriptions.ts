import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { projects, subscriptions, users } from "@/lib/db/schema";

/**
 * Whether the user currently has at least one ACTIVE hosting subscription. Used
 * to gate referral-code creation ("Abo only"). Reads via `db` (not a tx) — it's
 * a standalone check, not part of the webhook transaction.
 */
export async function userHasActiveSubscription(
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
      ),
    )
    .limit(1);
  return !!row;
}

// Subscription + user-resolution helpers for the Stripe webhook. All take the
// caller's transaction handle so they compose into one atomic, retry-safe unit.

export type SubRow = typeof subscriptions.$inferSelect;

export async function userIdByEmail(
  tx: Tx,
  email: string,
): Promise<string | null> {
  const [u] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return u?.id ?? null;
}

export async function userIdById(tx: Tx, id: string): Promise<string | null> {
  const [u] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return u?.id ?? null;
}

export async function userIdByCustomer(
  tx: Tx,
  customerId: string,
): Promise<string | null> {
  const [u] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);
  return u?.id ?? null;
}

/**
 * Record the paying user's Stripe customer id — but only if their column is
 * empty or already equals it. Never overwrite a DIFFERENT existing customer id
 * (a crafted checkout with a stranger's email must not hijack the portal).
 */
export async function setUserStripeCustomer(
  tx: Tx,
  userId: string,
  customerId: string,
): Promise<void> {
  await tx
    .update(users)
    .set({ stripeCustomerId: customerId })
    .where(
      and(
        eq(users.id, userId),
        sql`(${users.stripeCustomerId} is null or ${users.stripeCustomerId} = ${customerId})`,
      ),
    );
}

export async function findSubByStripeId(
  tx: Tx,
  stripeSubscriptionId: string,
): Promise<SubRow | null> {
  const [s] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return s ?? null;
}

/**
 * Upsert our subscription row by Stripe subscription id (self-healing across
 * out-of-order webhooks). On conflict we update status/period/etc. but never
 * overwrite `userId`, and only set `projectId` when we actually have one (so a
 * later event can't null out the link established at checkout).
 */
export async function upsertSubscription(
  tx: Tx,
  args: {
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    userId: string;
    projectId: string | null;
    status: string;
    priceId?: string | null;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
  },
): Promise<void> {
  const now = new Date();
  await tx
    .insert(subscriptions)
    .values({
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeCustomerId: args.stripeCustomerId,
      userId: args.userId,
      projectId: args.projectId,
      status: args.status,
      priceId: args.priceId ?? null,
      currentPeriodEnd: args.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd ?? false,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        status: args.status,
        stripeCustomerId: args.stripeCustomerId,
        updatedAt: now,
        ...(args.priceId !== undefined ? { priceId: args.priceId } : {}),
        ...(args.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: args.currentPeriodEnd }
          : {}),
        ...(args.cancelAtPeriodEnd !== undefined
          ? { cancelAtPeriodEnd: args.cancelAtPeriodEnd }
          : {}),
        ...(args.projectId ? { projectId: args.projectId } : {}),
      },
    });
}

/** Flip the denormalised hosting entitlement on a project (cheap read + gate). */
export async function setProjectHosting(
  tx: Tx,
  projectId: string,
  active: boolean,
): Promise<void> {
  await tx
    .update(projects)
    .set({ hostingActive: active, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
