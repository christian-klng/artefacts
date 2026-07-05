import { getStripe } from "@/lib/stripe/client";
import { stripeWebhookSecret } from "@/lib/stripe/env";
import { handleStripeEvent } from "@/lib/stripe/webhook";

// Public, unauthenticated Stripe webhook — the ONLY way payments reach the app.
// Security is the Stripe signature (constructEventAsync verifies the raw body
// against STRIPE_WEBHOOK_SECRET), NOT a session. Must read the RAW body: parsing
// JSON first would break signature verification. Node runtime (Stripe SDK +
// Postgres). Handler failures return 500 so Stripe retries — the handler tx
// already rolled back, so the retry is safe and idempotent.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = stripeWebhookSecret();
  if (!stripe || !secret) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const raw = await request.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (e) {
    console.error("[stripe/webhook] signature verification failed", e);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (e) {
    console.error("[stripe/webhook] handler failed", event.type, e);
    return new Response("Handler error", { status: 500 });
  }

  return Response.json({ received: true });
}
