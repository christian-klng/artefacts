import { auth } from "@/auth";
import { ensurePersonalCoupon, getUserCouponInfo } from "@/lib/coupons";
import { userHasActiveSubscription } from "@/lib/stripe/subscriptions";

// The signed-in user's coupon state: their own referral code (+ redemption
// stats) and whether they've already redeemed one. POST activates the personal
// code. Touches Postgres, so Node runtime.
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const info = await getUserCouponInfo(session.user.id);
  return Response.json(info);
}

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  // A referral code can only be CREATED by a user with an active subscription
  // (the "Abo only" rule). Existing codes keep working if the sub later lapses.
  if (!(await userHasActiveSubscription(session.user.id))) {
    return Response.json({ error: "subscription_required" }, { status: 403 });
  }
  await ensurePersonalCoupon(session.user.id);
  const info = await getUserCouponInfo(session.user.id);
  return Response.json(info);
}
