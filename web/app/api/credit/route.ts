import { auth } from "@/auth";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userCredits, usageEvents } from "@/lib/db/schema";
import { ensureCredit, getBalanceBreakdown } from "@/lib/cortecs/billing";

// Reads the signed-in user's EUR credit balance and, optionally, recent usage
// history. Touches Postgres + the billing layer, so it must run on Node.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  // ensureCredit also grants the free tier on first ever read, so a brand-new
  // user immediately sees their starting balance. The breakdown then splits the
  // total into persistent (free grant + coupons + top-ups) vs. expiring monthly
  // subscription credit for the account UI.
  await ensureCredit(userId);
  const balance = await getBalanceBreakdown(userId);

  const [credit] = await db
    .select({ freeGrantedEur: userCredits.freeGrantedEur })
    .from(userCredits)
    .where(eq(userCredits.userId, userId));

  const url = new URL(request.url);
  let history: unknown[] | undefined;
  if (url.searchParams.get("history") === "1") {
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit")) || 50, 1),
      200,
    );
    const rows = await db
      .select({
        id: usageEvents.id,
        projectId: usageEvents.projectId,
        task: usageEvents.task,
        model: usageEvents.model,
        provider: usageEvents.provider,
        inputTokens: usageEvents.inputTokens,
        outputTokens: usageEvents.outputTokens,
        billedEur: usageEvents.billedEur,
        createdAt: usageEvents.createdAt,
      })
      .from(usageEvents)
      .where(eq(usageEvents.userId, userId))
      .orderBy(desc(usageEvents.createdAt))
      .limit(limit);
    history = rows.map((r) => ({ ...r, billedEur: Number(r.billedEur) }));
  }

  return Response.json({
    balanceEur: balance.totalEur,
    persistentEur: balance.persistentEur,
    monthlyEur: balance.monthlyEur,
    monthlyExpiresAt: balance.monthlyExpiresAt,
    freeGrantedEur: Number(credit?.freeGrantedEur ?? 0),
    ...(history ? { history } : {}),
  });
}
