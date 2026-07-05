import { auth } from "@/auth";
import { redeemCoupon } from "@/lib/coupons";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

// Redeem a coupon code for the signed-in user. Grants the recipient credit
// immediately; records the referrer reward as pending. Node runtime (Postgres).
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const messages = getMessages(await resolveLocale()).coupon.errors;

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
      { error: result.error, message: messages[result.error] },
      { status: 400 },
    );
  }

  return Response.json({
    creditedEur: result.creditedEur,
    balanceEur: result.balanceEur,
  });
}
