import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { coupons, couponRedemptions, userCredits } from "@/lib/db/schema";
import {
  referralRecipientEur,
  referralReferrerEur,
  referralWindowDays,
} from "@/lib/cortecs/config";

// Coupons / referral credit. Redeeming a coupon grants the redeemer the
// recipient amount IMMEDIATELY; the referrer's reward is only RECORDED as
// pending (referrer_reward_status = "pending") and is NOT paid out here — the
// future Stripe/subscription integration calls settleReferralRewards() to grant
// it once the redeemer subscribes within the window. See lib/db/schema.ts.

// EUR is numeric(12,6); compute in a fixed 6-dp space (mirrors lib/cortecs/billing).
const SCALE = 1_000_000;
function round6(n: number): number {
  return Math.round(n * SCALE) / SCALE;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Unambiguous alphabet (no I/O/0/1) for human-typable codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCouponCode(): string {
  const bytes = randomBytes(6);
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `KUBI-${s}`;
}

/** Uppercase + trim a submitted code; returns "" if it's not a plausible code. */
export function normalizeCode(raw: string): string {
  const c = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (c.length < 3 || c.length > 40) return "";
  if (!/^[A-Z0-9-]+$/.test(c)) return "";
  return c;
}

export type ReferralCoupon = typeof coupons.$inferSelect;

/** The user's personal referral coupon, or null if not activated yet. */
export async function getReferralCoupon(
  userId: string,
): Promise<ReferralCoupon | null> {
  const [row] = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.ownerId, userId), eq(coupons.kind, "referral")))
    .limit(1);
  return row ?? null;
}

/**
 * Get-or-create the user's ONE personal referral coupon (idempotent). Amounts
 * come from the current referral settings. Retries on the (rare) code collision;
 * the owner-referral partial unique index makes the create itself idempotent.
 *
 * NOTE: the future "subscribers only" gate belongs at the CALL SITE (the /me
 * POST route), not here — this stays a pure data helper.
 */
export async function ensurePersonalCoupon(
  userId: string,
): Promise<ReferralCoupon> {
  const existing = await getReferralCoupon(userId);
  if (existing) return existing;

  const recipient = round6(await referralRecipientEur());
  const referrer = round6(await referralReferrerEur());
  const windowDays = Math.round(await referralWindowDays());

  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await db
      .insert(coupons)
      .values({
        code: generateCouponCode(),
        ownerId: userId,
        kind: "referral",
        recipientAmountEur: String(recipient),
        referrerAmountEur: String(referrer),
        referrerRequiresSubscription: true,
        rewardWindowDays: windowDays,
        maxRedemptions: null,
        expiresAt: null,
        active: true,
        createdByAdmin: false,
      })
      // DO NOTHING on ANY conflict: a code collision (retry) or the owner
      // already having a referral coupon (re-select below).
      .onConflictDoNothing()
      .returning();
    if (row) return row;

    const again = await getReferralCoupon(userId);
    if (again) return again;
    // else: it was a code collision — loop and try a fresh code.
  }
  throw new Error("Could not create referral coupon (code collisions)");
}

export type RedeemError =
  | "invalid"
  | "inactive"
  | "expired"
  | "exhausted"
  | "self"
  | "already_redeemed"
  | "already_referral";

export type RedeemResult =
  | { ok: true; creditedEur: number; balanceEur: number }
  | { ok: false; error: RedeemError };

/**
 * Redeem `rawCode` for `userId`. One transaction, coupon row locked FOR UPDATE
 * so the redemption count can't race. Credits the redeemer immediately; records
 * the referrer reward as pending (no payout here). Rules enforced:
 *  - coupon must exist / be active / not expired / under its redemption cap
 *  - a user cannot redeem their own coupon
 *  - a coupon can be redeemed at most once per user
 *  - a user can redeem at most ONE referral coupon ever (welcome bonus)
 */
export async function redeemCoupon(
  userId: string,
  rawCode: string,
): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "invalid" };

  return db.transaction(async (tx) => {
    const [coupon] = await tx
      .select()
      .from(coupons)
      .where(eq(coupons.code, code))
      .for("update");

    if (!coupon) return { ok: false, error: "invalid" };
    if (!coupon.active) return { ok: false, error: "inactive" };
    if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
      return { ok: false, error: "expired" };
    }
    if (coupon.ownerId && coupon.ownerId === userId) {
      return { ok: false, error: "self" };
    }

    // One referral redemption per user (the welcome bonus is once-ever).
    if (coupon.kind === "referral") {
      const [prior] = await tx
        .select({ id: couponRedemptions.id })
        .from(couponRedemptions)
        .where(
          and(
            eq(couponRedemptions.redeemerId, userId),
            eq(couponRedemptions.couponKind, "referral"),
          ),
        )
        .limit(1);
      if (prior) return { ok: false, error: "already_referral" };
    }

    // This specific coupon, once per user.
    const [dup] = await tx
      .select({ id: couponRedemptions.id })
      .from(couponRedemptions)
      .where(
        and(
          eq(couponRedemptions.couponId, coupon.id),
          eq(couponRedemptions.redeemerId, userId),
        ),
      )
      .limit(1);
    if (dup) return { ok: false, error: "already_redeemed" };

    // Redemption cap (accurate under the FOR UPDATE lock on the coupon row).
    if (coupon.maxRedemptions != null) {
      const [{ n }] = await tx
        .select({ n: sql<string>`count(*)` })
        .from(couponRedemptions)
        .where(eq(couponRedemptions.couponId, coupon.id));
      if (Number(n) >= coupon.maxRedemptions) {
        return { ok: false, error: "exhausted" };
      }
    }

    const recipient = round6(Number(coupon.recipientAmountEur));
    const referrer = round6(Number(coupon.referrerAmountEur));
    const hasReferrerReward = coupon.ownerId != null && referrer > 0;

    // Credit the redeemer immediately (ensure their credit row exists first).
    await tx
      .insert(userCredits)
      .values({ userId })
      .onConflictDoNothing({ target: userCredits.userId });
    const [updated] = await tx
      .update(userCredits)
      .set({
        balanceEur: sql`${userCredits.balanceEur} + ${recipient}`,
        updatedAt: new Date(),
      })
      .where(eq(userCredits.userId, userId))
      .returning();

    const now = new Date();
    const deadline = hasReferrerReward
      ? new Date(now.getTime() + coupon.rewardWindowDays * DAY_MS)
      : null;

    await tx.insert(couponRedemptions).values({
      couponId: coupon.id,
      redeemerId: userId,
      couponKind: coupon.kind,
      recipientCreditedEur: String(recipient),
      ownerId: coupon.ownerId,
      referrerRewardEur: String(hasReferrerReward ? referrer : 0),
      referrerRewardStatus: hasReferrerReward ? "pending" : "none",
      referrerRewardDeadline: deadline,
    });

    return {
      ok: true,
      creditedEur: recipient,
      balanceEur: Number(updated.balanceEur),
    };
  });
}

export type CouponInfo = {
  activated: boolean;
  code: string | null;
  recipientAmountEur: number;
  referrerAmountEur: number;
  /** Whether the user has already redeemed a referral coupon (can't again). */
  hasRedeemed: boolean;
  /** Redemptions of the user's OWN code — no redeemer identity is exposed. */
  redemptions: {
    redeemedAt: string;
    rewardEur: number;
    rewardStatus: string;
  }[];
  stats: { count: number; pendingEur: number; grantedEur: number };
};

/**
 * Everything the account modal needs: the user's own code (if activated), its
 * redemption stats (so they can see "was my code used?"), and whether they've
 * already redeemed a code themselves.
 */
export async function getUserCouponInfo(userId: string): Promise<CouponInfo> {
  const [coupon, redeemedRow, defRecipient, defReferrer] = await Promise.all([
    getReferralCoupon(userId),
    db
      .select({ id: couponRedemptions.id })
      .from(couponRedemptions)
      .where(
        and(
          eq(couponRedemptions.redeemerId, userId),
          eq(couponRedemptions.couponKind, "referral"),
        ),
      )
      .limit(1),
    referralRecipientEur(),
    referralReferrerEur(),
  ]);

  let redemptions: CouponInfo["redemptions"] = [];
  const stats = { count: 0, pendingEur: 0, grantedEur: 0 };

  if (coupon) {
    const rows = await db
      .select({
        redeemedAt: couponRedemptions.redeemedAt,
        rewardEur: couponRedemptions.referrerRewardEur,
        rewardStatus: couponRedemptions.referrerRewardStatus,
      })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.couponId, coupon.id))
      .orderBy(desc(couponRedemptions.redeemedAt));

    redemptions = rows.map((r) => ({
      redeemedAt: r.redeemedAt.toISOString(),
      rewardEur: Number(r.rewardEur),
      rewardStatus: r.rewardStatus,
    }));
    stats.count = rows.length;
    for (const r of rows) {
      const eur = Number(r.rewardEur);
      if (r.rewardStatus === "pending") stats.pendingEur += eur;
      if (r.rewardStatus === "granted") stats.grantedEur += eur;
    }
    stats.pendingEur = round6(stats.pendingEur);
    stats.grantedEur = round6(stats.grantedEur);
  }

  return {
    activated: coupon != null,
    code: coupon?.code ?? null,
    recipientAmountEur: coupon
      ? Number(coupon.recipientAmountEur)
      : round6(defRecipient),
    referrerAmountEur: coupon
      ? Number(coupon.referrerAmountEur)
      : round6(defReferrer),
    hasRedeemed: redeemedRow.length > 0,
    redemptions,
    stats,
  };
}

/**
 * FUTURE (Stripe/subscription — not wired yet): call when `redeemerId`
 * subscribes. Grants each still-pending referrer reward whose deadline hasn't
 * passed to the coupon owner, marking it "granted"; past-deadline rewards are
 * marked "expired". Intentionally not invoked anywhere until Stripe lands, so
 * no referrer payout happens now (per the agreed scope).
 */
export async function settleReferralRewards(redeemerId: string): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(couponRedemptions)
      .where(
        and(
          eq(couponRedemptions.redeemerId, redeemerId),
          eq(couponRedemptions.referrerRewardStatus, "pending"),
        ),
      )
      .for("update");

    for (const r of pending) {
      const expired =
        r.referrerRewardDeadline != null &&
        r.referrerRewardDeadline.getTime() < now.getTime();
      const reward = round6(Number(r.referrerRewardEur));

      if (expired || r.ownerId == null || reward <= 0) {
        await tx
          .update(couponRedemptions)
          .set({ referrerRewardStatus: "expired" })
          .where(eq(couponRedemptions.id, r.id));
        continue;
      }

      await tx
        .insert(userCredits)
        .values({ userId: r.ownerId })
        .onConflictDoNothing({ target: userCredits.userId });
      await tx
        .update(userCredits)
        .set({
          balanceEur: sql`${userCredits.balanceEur} + ${reward}`,
          updatedAt: now,
        })
        .where(eq(userCredits.userId, r.ownerId));
      await tx
        .update(couponRedemptions)
        .set({ referrerRewardStatus: "granted", referrerRewardGrantedAt: now })
        .where(eq(couponRedemptions.id, r.id));
    }
  });
}
