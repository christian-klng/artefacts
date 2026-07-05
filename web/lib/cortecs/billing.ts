import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db";
import { creditGrants, userCredits, usageEvents } from "@/lib/db/schema";
import {
  billingMargin,
  cacheReadPriceRatio,
  cacheWritePriceRatio,
  cortecsFeeMultiplier,
  freeTierGrantEur,
  type TaskKind,
} from "./config";
import { getModelPrice } from "./prices";

// EUR is stored as numeric(12,6); compute in a fixed 6-dp space so the column,
// the ledger, and the UI all agree.
const SCALE = 1_000_000;
function round6(n: number): number {
  return Math.round(n * SCALE) / SCALE;
}

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

export type BilledCost = {
  cortecsCostEur: number;
  billedEur: number;
  marginEur: number;
  provider: string | null;
};

/**
 * Computes what a request costs us (Cortecs) and what we bill the user, from
 * token counts × the model's EUR catalog price. The margin lives in the price:
 * `billedEur = cortecsCostEur × BILLING_MARGIN`.
 *
 * Cache tokens are priced separately: real catalog cache prices when Cortecs
 * exposes them, otherwise derived from the input price via the Anthropic
 * ratios (read 0.1×, write 1.25× — admin-tunable). Billing them at the full
 * input rate (the old v1 behavior) overcharged cache-heavy agent turns ~3×
 * vs. the real Cortecs cost.
 */
export async function computeBilledEur(
  model: string,
  usage: TokenUsage,
  fallbackModel?: string,
): Promise<BilledCost> {
  const price = await getModelPrice(model, fallbackModel);
  const cacheReadPerMillion =
    price.cacheReadPerMillion ??
    price.inputPerMillion * (await cacheReadPriceRatio());
  const cacheCreationPerMillion =
    price.cacheCreationPerMillion ??
    price.inputPerMillion * (await cacheWritePriceRatio());

  const rawCost =
    (usage.inputTokens * price.inputPerMillion +
      usage.cacheCreationTokens * cacheCreationPerMillion +
      usage.cacheReadTokens * cacheReadPerMillion +
      usage.outputTokens * price.outputPerMillion) /
    1_000_000;

  const cortecsCostEur = round6(rawCost * (await cortecsFeeMultiplier()));
  const billedEur = round6(cortecsCostEur * (await billingMargin()));
  const marginEur = round6(billedEur - cortecsCostEur);

  return {
    cortecsCostEur,
    billedEur,
    marginEur,
    provider: price.providers[0] ?? null,
  };
}

/** Per-model token usage as the Agent SDK reports it (result.modelUsage). */
export type ModelTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
};

/**
 * Prices a whole agent turn from the SDK's per-model usage map. Each model is
 * priced from its own catalog entry (a turn may touch more than one model), then
 * the costs and tokens are summed. Returns the aggregate plus the dominant model
 * (highest billed cost) for ledger attribution, or null if the turn used no
 * tokens. Throws if any model's price can't be resolved (never bills 0).
 */
export async function billModelUsage(
  modelUsage: Record<string, ModelTokens>,
  fallbackModel: string,
): Promise<{
  usage: TokenUsage;
  cost: BilledCost;
  model: string;
  provider: string | null;
} | null> {
  const totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  const totalCost: BilledCost = {
    cortecsCostEur: 0,
    billedEur: 0,
    marginEur: 0,
    provider: null,
  };
  let dominant: { model: string; provider: string | null; billed: number } | null =
    null;

  for (const [model, mu] of Object.entries(modelUsage)) {
    const usage: TokenUsage = {
      inputTokens: mu.inputTokens ?? 0,
      outputTokens: mu.outputTokens ?? 0,
      cacheReadTokens: mu.cacheReadInputTokens ?? 0,
      cacheCreationTokens: mu.cacheCreationInputTokens ?? 0,
    };
    if (
      usage.inputTokens === 0 &&
      usage.outputTokens === 0 &&
      usage.cacheReadTokens === 0 &&
      usage.cacheCreationTokens === 0
    ) {
      continue;
    }

    const cost = await computeBilledEur(model, usage, fallbackModel);

    totalUsage.inputTokens += usage.inputTokens;
    totalUsage.outputTokens += usage.outputTokens;
    totalUsage.cacheReadTokens += usage.cacheReadTokens;
    totalUsage.cacheCreationTokens += usage.cacheCreationTokens;
    totalCost.cortecsCostEur = round6(
      totalCost.cortecsCostEur + cost.cortecsCostEur,
    );
    totalCost.billedEur = round6(totalCost.billedEur + cost.billedEur);
    totalCost.marginEur = round6(totalCost.marginEur + cost.marginEur);

    if (!dominant || cost.billedEur > dominant.billed) {
      dominant = { model, provider: cost.provider, billed: cost.billedEur };
    }
  }

  if (!dominant) return null;
  totalCost.provider = dominant.provider;
  return {
    usage: totalUsage,
    cost: totalCost,
    model: dominant.model,
    provider: dominant.provider,
  };
}

/**
 * Ensures the user has a credit row and grants the one-time free tier on first
 * use. Idempotent: the grant happens once (guarded by freeGrantedAt under a row
 * lock). Returns the current balance in EUR.
 */
export async function ensureCredit(userId: string): Promise<number> {
  // Resolve the grant amount before opening the transaction so the settings
  // read doesn't run on the transaction's pinned connection.
  const grant = await freeTierGrantEur();
  return db.transaction(async (tx) => {
    await tx
      .insert(userCredits)
      .values({ userId })
      .onConflictDoNothing({ target: userCredits.userId });

    const [row] = await tx
      .select()
      .from(userCredits)
      .where(eq(userCredits.userId, userId))
      .for("update");

    let persistent = Number(row?.balanceEur ?? 0);
    if (row && row.freeGrantedAt == null && grant > 0) {
      const granted = round6(grant);
      const [updated] = await tx
        .update(userCredits)
        .set({
          balanceEur: sql`${userCredits.balanceEur} + ${granted}`,
          freeGrantedEur: String(granted),
          freeGrantedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userCredits.userId, userId))
        .returning();
      persistent = Number(updated.balanceEur);
    }

    // Return the TOTAL spendable (persistent + non-expired grants) so the
    // pre-flight gate and the returned balance stay consistent with getBalance.
    const grants = await activeGrants(tx, userId);
    return round6(persistent + grants.totalEur);
  });
}

// Sum of a user's still-spendable expiring credit grants (Stripe subscription
// perk), plus the soonest expiry for the UI. Lazy expiry: past-due grants are
// excluded by the `expires_at > now()` predicate — no cron drains them. `runner`
// may be the db or a transaction (Tx extends the db type), so the deduction path
// can read grants it just updated inside its own transaction.
async function activeGrants(
  runner: typeof db | Tx,
  userId: string,
): Promise<{ totalEur: number; soonestExpiry: Date | null }> {
  const [row] = await runner
    .select({
      total: sql<string>`coalesce(sum(${creditGrants.remainingEur}), 0)`,
      soonest: sql<Date | null>`min(${creditGrants.expiresAt})`,
    })
    .from(creditGrants)
    .where(
      sql`${creditGrants.userId} = ${userId} and ${creditGrants.expiresAt} > now() and ${creditGrants.remainingEur} > 0`,
    );
  return {
    totalEur: round6(Number(row?.total ?? 0)),
    soonestExpiry: row?.soonest ?? null,
  };
}

/**
 * Current spendable balance in EUR: the persistent balance (free grant + coupons
 * + top-ups) PLUS all non-expired subscription credit grants. This is the
 * pre-flight budget gate — it must include grants, else a user whose only credit
 * is their monthly subscription perk would be wrongly blocked.
 */
export async function getBalance(userId: string): Promise<number> {
  const [rows, grants] = await Promise.all([
    db
      .select({ balanceEur: userCredits.balanceEur })
      .from(userCredits)
      .where(eq(userCredits.userId, userId)),
    activeGrants(db, userId),
  ]);
  return round6(Number(rows[0]?.balanceEur ?? 0) + grants.totalEur);
}

export type BalanceBreakdown = {
  /** Total spendable = persistent + monthly. */
  totalEur: number;
  /** Never-expiring: free grant + coupons + top-ups. */
  persistentEur: number;
  /** Still-active expiring subscription credit. */
  monthlyEur: number;
  /** ISO date the soonest-expiring monthly grant lapses, or null if none. */
  monthlyExpiresAt: string | null;
};

/** The two credit sources, split for the account UI (persistent vs. expiring). */
export async function getBalanceBreakdown(
  userId: string,
): Promise<BalanceBreakdown> {
  const [rows, grants] = await Promise.all([
    db
      .select({ balanceEur: userCredits.balanceEur })
      .from(userCredits)
      .where(eq(userCredits.userId, userId)),
    activeGrants(db, userId),
  ]);
  const persistentEur = round6(Number(rows[0]?.balanceEur ?? 0));
  return {
    totalEur: round6(persistentEur + grants.totalEur),
    persistentEur,
    monthlyEur: grants.totalEur,
    monthlyExpiresAt: grants.soonestExpiry
      ? new Date(grants.soonestExpiry).toISOString()
      : null,
  };
}

/**
 * Records a billed request in the ledger and deducts its cost in a single
 * transaction (ledger + credit stay consistent). The cost is drawn from EXPIRING
 * subscription grants first (soonest expiry, so credit that would lapse is spent
 * before it does) and only the remainder from the persistent balance. Returns
 * the new TOTAL spendable balance (persistent + still-active grants).
 *
 * Race-safety: the grant rows are locked with SELECT … FOR UPDATE before the
 * read-decide-write, so two concurrent turns can't both spend the same grant
 * (the default READ COMMITTED isolation would otherwise lose an update — the
 * bare balance UPDATE is safe on its own row, but the grants are separate rows).
 */
export async function recordUsageAndDeduct(args: {
  userId: string;
  projectId: string | null;
  task: TaskKind;
  model: string;
  provider: string | null;
  usage: TokenUsage;
  cost: BilledCost;
}): Promise<number> {
  const { userId, projectId, task, model, provider, usage, cost } = args;

  return db.transaction(async (tx) => {
    await tx.insert(usageEvents).values({
      userId,
      projectId: projectId ?? null,
      task,
      model,
      provider: provider ?? cost.provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      cortecsCostEur: String(cost.cortecsCostEur),
      billedEur: String(cost.billedEur),
      marginEur: String(cost.marginEur),
    });

    // 1. Draw from expiring grants first (soonest expiry), locked FOR UPDATE.
    let owed = round6(cost.billedEur);
    if (owed > 0) {
      const grants = await tx
        .select({ id: creditGrants.id, remainingEur: creditGrants.remainingEur })
        .from(creditGrants)
        .where(
          sql`${creditGrants.userId} = ${userId} and ${creditGrants.expiresAt} > now() and ${creditGrants.remainingEur} > 0`,
        )
        .orderBy(asc(creditGrants.expiresAt))
        .for("update");
      for (const g of grants) {
        if (owed <= 0) break;
        const remaining = round6(Number(g.remainingEur));
        const take = Math.min(remaining, owed);
        await tx
          .update(creditGrants)
          .set({ remainingEur: String(round6(remaining - take)) })
          .where(eq(creditGrants.id, g.id));
        owed = round6(owed - take);
      }
    }

    // 2. Remainder from the persistent balance (ensure the row exists first).
    //    May go slightly negative on a final turn — the next turn's gate blocks.
    await tx
      .insert(userCredits)
      .values({ userId })
      .onConflictDoNothing({ target: userCredits.userId });
    const [updated] = await tx
      .update(userCredits)
      .set({
        balanceEur: sql`${userCredits.balanceEur} - ${owed}`,
        updatedAt: new Date(),
      })
      .where(eq(userCredits.userId, userId))
      .returning();

    // 3. Return the new total spendable (persistent + grants after this deduction).
    const grantsAfter = await activeGrants(tx, userId);
    return round6(Number(updated.balanceEur) + grantsAfter.totalEur);
  });
}

/**
 * A project's chat-turn costs from the ledger, oldest first. Costs are never
 * persisted as message rows — the transcript merges these in by timestamp on
 * load (a turn's usage is recorded right after its messages), so per-turn
 * cost lines survive reloads without double bookkeeping. Only chat-turn tasks
 * are included; background tasks would show as anchorless lines mid-chat.
 */
export async function listProjectUsage(projectId: string) {
  return db
    .select({
      id: usageEvents.id,
      task: usageEvents.task,
      billedEur: usageEvents.billedEur,
      createdAt: usageEvents.createdAt,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.projectId, projectId),
        inArray(usageEvents.task, ["build", "interview"]),
      ),
    )
    .orderBy(asc(usageEvents.createdAt));
}
