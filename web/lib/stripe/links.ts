import "server-only";
import {
  stripeSubscriptionLinkUrl,
  stripeTopupLinkUrl,
} from "@/lib/cortecs/config";

// Static Stripe Payment Links, parameterized at click time. Stripe copies a
// URL's `client_reference_id` onto the resulting checkout.session.completed
// event, and `prefilled_email` pre-fills (and thus pins) the email we resolve
// the paying user by. Subscription link → client_reference_id = projectId (the
// app being hosted); top-up links → client_reference_id = userId.

export function withCheckoutParams(
  base: string,
  clientReferenceId: string,
  email: string | null,
): string | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null; // misconfigured/blank link → treated as unavailable
  }
  url.searchParams.set("client_reference_id", clientReferenceId);
  if (email) url.searchParams.set("prefilled_email", email);
  return url.toString();
}

export type CheckoutLinks = {
  /** Null when the subscription link is unset or no projectId was given. */
  subscriptionUrl: string | null;
  topupUrls: { "5": string | null; "10": string | null; "20": string | null };
};

/** Build the click-ready checkout URLs for a user (+ optional app to host). */
export async function buildCheckoutLinks(opts: {
  userId: string;
  email: string | null;
  projectId?: string | null;
}): Promise<CheckoutLinks> {
  const [subBase, t5, t10, t20] = await Promise.all([
    stripeSubscriptionLinkUrl(),
    stripeTopupLinkUrl(5),
    stripeTopupLinkUrl(10),
    stripeTopupLinkUrl(20),
  ]);
  const subscriptionUrl =
    subBase && opts.projectId
      ? withCheckoutParams(subBase, opts.projectId, opts.email)
      : null;
  const topup = (base: string) =>
    base ? withCheckoutParams(base, opts.userId, opts.email) : null;
  return {
    subscriptionUrl,
    topupUrls: { "5": topup(t5), "10": topup(t10), "20": topup(t20) },
  };
}
