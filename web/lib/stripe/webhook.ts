import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db";
import { projects, stripeEvents, subscriptions } from "@/lib/db/schema";
import { subscriptionMonthlyCreditEur } from "@/lib/cortecs/config";
import { settleReferralRewards } from "@/lib/coupons";
import { addTopupCredit, grantMonthlyCredit } from "./credit";
import {
  findSubByStripeId,
  setProjectHosting,
  setUserStripeCustomer,
  upsertSubscription,
  userIdByCustomer,
  userIdByEmail,
  userIdById,
} from "./subscriptions";

// Stripe webhook dispatch. Every event is processed in ONE db transaction that
// also inserts the stripe_event dedupe row: a re-delivered event finds its id
// present and no-ops; a handler that throws rolls back the whole tx (dedupe row
// included) so Stripe's retry re-runs it cleanly. Field accessors below are
// deliberately defensive — Stripe moves fields between API versions (e.g.
// invoice.subscription, subscription.current_period_end), and we don't pin one.

// --- defensive field accessors ---------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function idOf(x: unknown): string | null {
  if (!x) return null;
  if (typeof x === "string") return x;
  const id = (x as any).id;
  return typeof id === "string" ? id : null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as any;
  return (
    idOf(inv.subscription) ??
    idOf(inv.parent?.subscription_details?.subscription) ??
    idOf(inv.lines?.data?.[0]?.subscription) ??
    idOf(inv.lines?.data?.[0]?.parent?.subscription_item_details?.subscription)
  );
}

/** The billing-period end of the paid invoice → the monthly grant's expiry. */
function invoicePeriodEnd(invoice: Stripe.Invoice): Date | null {
  const end = (invoice as any).lines?.data?.[0]?.period?.end;
  return typeof end === "number" ? new Date(end * 1000) : null;
}

function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const s = sub as any;
  const end = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return typeof end === "number" ? new Date(end * 1000) : null;
}

function subscriptionPriceId(sub: Stripe.Subscription): string | null {
  return (sub as any).items?.data?.[0]?.price?.id ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- handlers (all run inside the caller's transaction) --------------------

/** Returns the userId whose referral rewards should settle (subscription), else null. */
async function handleCheckoutCompleted(
  tx: Tx,
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const email = session.customer_details?.email ?? null;
  const customerId = idOf(session.customer);

  if (session.mode === "payment") {
    // Top-up: credit the persistent balance by what they actually paid.
    if ((session.currency ?? "eur").toLowerCase() !== "eur") return null;
    const amountEur = (session.amount_total ?? 0) / 100;
    if (amountEur <= 0) return null;
    let userId = email ? await userIdByEmail(tx, email) : null;
    if (!userId && session.client_reference_id) {
      userId = await userIdById(tx, session.client_reference_id);
    }
    if (!userId) throw new Error("checkout(payment): cannot resolve user");
    if (customerId) await setUserStripeCustomer(tx, userId, customerId);
    await addTopupCredit(tx, { userId, amountEur });
    return null;
  }

  if (session.mode === "subscription") {
    const subId = idOf(session.subscription);
    const projectId = session.client_reference_id ?? null;
    // The PAYING user (owner of the Stripe customer) is resolved by the pinned
    // email; we set the customer id only on them.
    const payingUserId = email ? await userIdByEmail(tx, email) : null;
    if (!payingUserId) {
      throw new Error("checkout(subscription): cannot resolve paying user");
    }
    if (customerId) await setUserStripeCustomer(tx, payingUserId, customerId);
    // Link the hosted app ONLY if it belongs to the paying user (ownership
    // check): a crafted link must not attach a subscription to someone else's
    // project. Mismatch → subscription recorded, but left unlinked.
    let linkedProjectId: string | null = null;
    if (projectId) {
      const proj = await tx.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });
      if (proj && proj.userId === payingUserId) linkedProjectId = proj.id;
    }
    if (subId && customerId) {
      await upsertSubscription(tx, {
        stripeSubscriptionId: subId,
        stripeCustomerId: customerId,
        userId: payingUserId,
        projectId: linkedProjectId,
        status: "active",
      });
      if (linkedProjectId) await setProjectHosting(tx, linkedProjectId, true);
    }
    return payingUserId; // settle any pending referral rewards for the subscriber
  }

  return null;
}

async function handleInvoicePaid(
  tx: Tx,
  invoice: Stripe.Invoice,
  monthlyCreditEur: number,
): Promise<void> {
  const reason = (invoice as { billing_reason?: string }).billing_reason;
  // Only the initial + recurring subscription invoices carry the monthly credit;
  // prorations / one-offs must not add an extra grant.
  if (reason !== "subscription_create" && reason !== "subscription_cycle") {
    return;
  }
  const subId = invoiceSubscriptionId(invoice);
  const invoiceId = invoice.id;
  if (!subId || !invoiceId) return;
  const periodEnd = invoicePeriodEnd(invoice);
  if (!periodEnd) throw new Error(`invoice.paid ${invoiceId}: no period end`);
  const customerId = idOf(invoice.customer);

  const sub = await findSubByStripeId(tx, subId);
  const userId =
    sub?.userId ?? (customerId ? await userIdByCustomer(tx, customerId) : null);
  // No subscription row and no customer→user match yet (checkout webhook lost
  // the race) → throw so Stripe retries once checkout.session.completed has run.
  if (!userId) throw new Error(`invoice.paid ${invoiceId}: cannot resolve user`);

  await upsertSubscription(tx, {
    stripeSubscriptionId: subId,
    stripeCustomerId: customerId ?? sub?.stripeCustomerId ?? "",
    userId,
    projectId: sub?.projectId ?? null,
    status: "active",
    currentPeriodEnd: periodEnd,
  });
  if (sub?.projectId) await setProjectHosting(tx, sub.projectId, true);

  await grantMonthlyCredit(tx, {
    userId,
    stripeSubscriptionId: subId,
    stripeInvoiceId: invoiceId,
    amountEur: monthlyCreditEur,
    expiresAt: periodEnd,
  });
}

async function handleSubscriptionChange(
  tx: Tx,
  sub: Stripe.Subscription,
): Promise<void> {
  const subId = sub.id;
  const status = sub.status; // active | past_due | canceled | unpaid | …
  const customerId = idOf(sub.customer);
  const existing = await findSubByStripeId(tx, subId);
  const userId =
    existing?.userId ??
    (customerId ? await userIdByCustomer(tx, customerId) : null);
  if (!userId) throw new Error(`subscription ${subId}: cannot resolve user`);

  await upsertSubscription(tx, {
    stripeSubscriptionId: subId,
    stripeCustomerId: customerId ?? existing?.stripeCustomerId ?? "",
    userId,
    projectId: existing?.projectId ?? null,
    status,
    priceId: subscriptionPriceId(sub),
    currentPeriodEnd: subscriptionPeriodEnd(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  });
  // Entitlement follows status. Canceled/past_due → premium features off; the
  // free <slug>.apps.<APPS_DOMAIN> subdomain keeps serving regardless.
  const projectId = existing?.projectId ?? null;
  if (projectId) await setProjectHosting(tx, projectId, status === "active");
}

async function handleInvoiceFailed(
  tx: Tx,
  invoice: Stripe.Invoice,
): Promise<void> {
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;
  const existing = await findSubByStripeId(tx, subId);
  if (!existing) return;
  await tx
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, subId));
  // hostingActive stays as-is; Stripe drives the eventual cancel via
  // customer.subscription.updated, which we handle above.
}

/**
 * Entry point for the webhook route. Idempotent + retry-safe. Any referral
 * settlement runs AFTER the transaction commits (it opens its own tx and must
 * not nest inside ours).
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  // Read the (cached) monthly-credit setting once, before the transaction, so no
  // unrelated query runs on the pinned tx connection.
  const monthlyCreditEur = await subscriptionMonthlyCreditEur();
  let settleReferralFor: string | null = null;

  const processed = await db.transaction(async (tx) => {
    const ins = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing({ target: stripeEvents.id })
      .returning({ id: stripeEvents.id });
    if (ins.length === 0) return false; // already processed → skip

    switch (event.type) {
      case "checkout.session.completed":
        settleReferralFor = await handleCheckoutCompleted(
          tx,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "invoice.paid":
        await handleInvoicePaid(
          tx,
          event.data.object as Stripe.Invoice,
          monthlyCreditEur,
        );
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(
          tx,
          event.data.object as Stripe.Subscription,
        );
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(tx, event.data.object as Stripe.Invoice);
        break;
      default:
        // Unhandled type — the event id is recorded, the handler is a no-op.
        break;
    }
    return true;
  });

  if (processed && settleReferralFor) {
    try {
      await settleReferralRewards(settleReferralFor);
    } catch (e) {
      console.error("[stripe/webhook] settleReferralRewards failed", e);
    }
  }
}
