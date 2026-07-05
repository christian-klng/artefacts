import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { creditGrants, userCredits } from "@/lib/db/schema";

// Credit mutations for the Stripe webhook. Both run INSIDE the caller's
// transaction (the same tx that inserts the stripe_event dedupe row), so a
// handler that throws rolls everything back and Stripe's retry re-runs cleanly.

// EUR is numeric(12,6); compute in a fixed 6-dp space (mirrors lib/cortecs/billing).
const SCALE = 1_000_000;
function round6(n: number): number {
  return Math.round(n * SCALE) / SCALE;
}

/**
 * One-time top-up → the PERSISTENT balance (user_credit.balanceEur), never
 * expires. Mirrors redeemCoupon: ensure the row exists, then increment.
 * Idempotency is provided by the webhook's stripe_event dedupe (one event id).
 */
export async function addTopupCredit(
  tx: Tx,
  args: { userId: string; amountEur: number },
): Promise<void> {
  const amount = round6(args.amountEur);
  if (amount <= 0) return;
  await tx
    .insert(userCredits)
    .values({ userId: args.userId })
    .onConflictDoNothing({ target: userCredits.userId });
  await tx
    .update(userCredits)
    .set({
      balanceEur: sql`${userCredits.balanceEur} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(userCredits.userId, args.userId));
}

/**
 * Monthly subscription credit → a new EXPIRING grant row (credit_grant). One row
 * per paid invoice; idempotent via the unique stripe_invoice_id (ON CONFLICT DO
 * NOTHING). Returns true if a grant was actually written, false if this invoice
 * had already been granted. `expiresAt` = the invoice's billing-period end.
 */
export async function grantMonthlyCredit(
  tx: Tx,
  args: {
    userId: string;
    stripeSubscriptionId: string | null;
    stripeInvoiceId: string;
    amountEur: number;
    expiresAt: Date;
  },
): Promise<boolean> {
  const amount = round6(args.amountEur);
  if (amount <= 0) return false;
  const rows = await tx
    .insert(creditGrants)
    .values({
      userId: args.userId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeInvoiceId: args.stripeInvoiceId,
      amountEur: String(amount),
      remainingEur: String(amount),
      expiresAt: args.expiresAt,
    })
    .onConflictDoNothing({ target: creditGrants.stripeInvoiceId })
    .returning({ id: creditGrants.id });
  return rows.length > 0;
}
