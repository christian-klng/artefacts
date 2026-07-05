import "server-only";
import Stripe from "stripe";
import { stripeSecretKey } from "./env";

// Lazily-constructed singleton Stripe client, or null when STRIPE_SECRET_KEY is
// unset (the payments feature is simply off). We do NOT pin an apiVersion: the
// SDK sends its own built-in version, and the webhook handlers read fields
// defensively (field locations drift between API versions — see webhook.ts).

let cached: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = stripeSecretKey();
  cached = key ? new Stripe(key) : null;
  return cached;
}
