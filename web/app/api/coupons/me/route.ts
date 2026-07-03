import { auth } from "@/auth";
import { ensurePersonalCoupon, getUserCouponInfo } from "@/lib/coupons";

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
  // FUTURE: gate activation to subscribers here (the "Abo only" rule).
  await ensurePersonalCoupon(session.user.id);
  const info = await getUserCouponInfo(session.user.id);
  return Response.json(info);
}
