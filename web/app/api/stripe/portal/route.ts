import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe/client";

// Opens a Stripe Billing Portal session so the user can manage/cancel their
// hosting subscriptions and payment method. Requires a stripeCustomerId, which
// is only set after their first successful checkout — the account UI gates the
// "Verwalten" button on `portalAvailable`.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const stripe = getStripe();
  if (!stripe) return new Response("Stripe not configured", { status: 503 });

  const [u] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!u?.stripeCustomerId) {
    return new Response("No Stripe customer", { status: 400 });
  }

  const base = process.env.AUTH_URL ?? new URL(request.url).origin;
  const portal = await stripe.billingPortal.sessions.create({
    customer: u.stripeCustomerId,
    return_url: `${base}/app`,
  });
  return Response.json({ url: portal.url });
}
