import { auth } from "@/auth";
import { redeemCoupon, type RedeemError } from "@/lib/coupons";

// Redeem a coupon code for the signed-in user. Grants the recipient credit
// immediately; records the referrer reward as pending. Node runtime (Postgres).
export const runtime = "nodejs";

const MESSAGES: Record<RedeemError, string> = {
  invalid: "Dieser Code ist ungültig.",
  inactive: "Dieser Code ist nicht mehr aktiv.",
  expired: "Dieser Code ist abgelaufen.",
  exhausted: "Dieser Code wurde bereits vollständig eingelöst.",
  self: "Du kannst deinen eigenen Code nicht einlösen.",
  already_redeemed: "Du hast diesen Code bereits eingelöst.",
  already_referral: "Du hast bereits einen Gutschein eingelöst.",
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let code = "";
  try {
    const body = await request.json();
    code = typeof body?.code === "string" ? body.code : "";
  } catch {
    // fall through — empty code is handled as "invalid" below
  }

  const result = await redeemCoupon(session.user.id, code);
  if (!result.ok) {
    return Response.json(
      { error: result.error, message: MESSAGES[result.error] },
      { status: 400 },
    );
  }

  return Response.json({
    creditedEur: result.creditedEur,
    balanceEur: result.balanceEur,
  });
}
