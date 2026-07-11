import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./db";
import {
  appSettings,
  coupons,
  couponRedemptions,
  errorLogs,
  files,
  mailTemplates,
  projects,
  userCredits,
  usageEvents,
  users,
} from "./schema";

export type UserRow = {
  id: string;
  name: string | null;
  email: string;
  createdAt: Date;
  appCount: number;
  /** Total billed so far (sum of usage_event.billed_eur), in EUR. */
  consumedEur: number;
  /** Currently spendable balance (user_credit.balance_eur), in EUR. */
  balanceEur: number;
  /** One-time free-tier grant, in EUR. */
  freeGrantedEur: number;
  /** Platform admin flag (user.is_admin) — grants read-only cross-user access. */
  isAdmin: boolean;
};

/**
 * All users with their app count, total consumed cost and available balance.
 * Aggregates are fetched in separate small queries and merged in JS — simpler
 * and robust against users that have no credit row / no usage / no projects.
 */
export async function listUsers(): Promise<UserRow[]> {
  const [us, credits, consumed, counts] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    db
      .select({
        userId: userCredits.userId,
        balanceEur: userCredits.balanceEur,
        freeGrantedEur: userCredits.freeGrantedEur,
      })
      .from(userCredits),
    db
      .select({
        userId: usageEvents.userId,
        total: sql<string>`coalesce(sum(${usageEvents.billedEur}), 0)`,
      })
      .from(usageEvents)
      .groupBy(usageEvents.userId),
    db
      .select({
        userId: projects.userId,
        count: sql<string>`count(*)`,
      })
      .from(projects)
      .groupBy(projects.userId),
  ]);

  const creditMap = new Map(credits.map((r) => [r.userId, r]));
  const consumedMap = new Map(consumed.map((r) => [r.userId, Number(r.total)]));
  const countMap = new Map(counts.map((r) => [r.userId, Number(r.count)]));

  return us.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    isAdmin: u.isAdmin,
    appCount: countMap.get(u.id) ?? 0,
    consumedEur: consumedMap.get(u.id) ?? 0,
    balanceEur: Number(creditMap.get(u.id)?.balanceEur ?? 0),
    freeGrantedEur: Number(creditMap.get(u.id)?.freeGrantedEur ?? 0),
  }));
}

export type AppRow = {
  id: string;
  name: string;
  template: string;
  published: boolean;
  publishSlug: string | null;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
  ownerEmail: string | null;
  ownerName: string | null;
  hasThumbnail: boolean;
};

/** All projects with their owner, newest activity first. */
export async function listApps(): Promise<AppRow[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      template: projects.template,
      published: projects.published,
      publishSlug: projects.publishSlug,
      featured: projects.featured,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      ownerEmail: users.email,
      ownerName: users.name,
      thumbnailId: files.id,
    })
    .from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .leftJoin(
      files,
      sql`${files.projectId} = ${projects.id} and ${files.path} = '/assets/og-thumbnail.png'`,
    )
    .orderBy(desc(projects.updatedAt));

  return rows.map(({ thumbnailId, ...app }) => ({
    ...app,
    hasThumbnail: thumbnailId !== null,
  }));
}

export type Totals = {
  userCount: number;
  appCount: number;
  publishedCount: number;
  consumedEur: number;
  balanceEur: number;
};

export type MailTemplateKey = "welcome" | "reset";

export type MailTemplate = {
  key: MailTemplateKey;
  subject: string;
  html: string;
  updatedAt: Date | null;
};

/**
 * Reads the two editable mail templates, returning blank entries for keys that
 * have no row yet. Blank = the builder uses its built-in default; the admin form
 * surfaces that with a hint.
 */
export async function getMailTemplates(): Promise<
  Record<MailTemplateKey, MailTemplate>
> {
  const rows = await db
    .select({
      key: mailTemplates.key,
      subject: mailTemplates.subject,
      html: mailTemplates.html,
      updatedAt: mailTemplates.updatedAt,
    })
    .from(mailTemplates);

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const make = (key: MailTemplateKey): MailTemplate => {
    const row = byKey.get(key);
    return {
      key,
      subject: row?.subject ?? "",
      html: row?.html ?? "",
      updatedAt: row?.updatedAt ?? null,
    };
  };
  return { welcome: make("welcome"), reset: make("reset") };
}

/**
 * Reads all stored operational settings as a { key: value } map. Keys with no
 * row are simply absent — the settings form falls back to its placeholder hint,
 * and the builder falls back to env/default (web/lib/settings.ts).
 */
export async function getAppSettings(): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

/** Headline numbers for the overview page. */
export async function getTotals(): Promise<Totals> {
  const [[u], [p], [pub], [usage], [credit]] = await Promise.all([
    db.select({ n: sql<string>`count(*)` }).from(users),
    db.select({ n: sql<string>`count(*)` }).from(projects),
    db
      .select({ n: sql<string>`count(*)` })
      .from(projects)
      .where(eq(projects.published, true)),
    db
      .select({ n: sql<string>`coalesce(sum(${usageEvents.billedEur}), 0)` })
      .from(usageEvents),
    db
      .select({ n: sql<string>`coalesce(sum(${userCredits.balanceEur}), 0)` })
      .from(userCredits),
  ]);

  return {
    userCount: Number(u?.n ?? 0),
    appCount: Number(p?.n ?? 0),
    publishedCount: Number(pub?.n ?? 0),
    consumedEur: Number(usage?.n ?? 0),
    balanceEur: Number(credit?.n ?? 0),
  };
}

export type CouponRow = {
  id: string;
  code: string;
  kind: string;
  ownerEmail: string | null;
  recipientAmountEur: number;
  referrerAmountEur: number;
  maxRedemptions: number | null;
  expiresAt: Date | null;
  expired: boolean;
  active: boolean;
  createdByAdmin: boolean;
  createdAt: Date;
  redemptionCount: number;
};

/** All coupons with their owner (who activated it) and redemption count. */
export async function listCoupons(): Promise<CouponRow[]> {
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: coupons.id,
        code: coupons.code,
        kind: coupons.kind,
        ownerEmail: users.email,
        recipientAmountEur: coupons.recipientAmountEur,
        referrerAmountEur: coupons.referrerAmountEur,
        maxRedemptions: coupons.maxRedemptions,
        expiresAt: coupons.expiresAt,
        active: coupons.active,
        createdByAdmin: coupons.createdByAdmin,
        createdAt: coupons.createdAt,
      })
      .from(coupons)
      .leftJoin(users, eq(coupons.ownerId, users.id))
      .orderBy(desc(coupons.createdAt)),
    db
      .select({
        couponId: couponRedemptions.couponId,
        n: sql<string>`count(*)`,
      })
      .from(couponRedemptions)
      .groupBy(couponRedemptions.couponId),
  ]);

  const countMap = new Map(counts.map((c) => [c.couponId, Number(c.n)]));
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    recipientAmountEur: Number(r.recipientAmountEur),
    referrerAmountEur: Number(r.referrerAmountEur),
    expired: r.expiresAt != null && r.expiresAt.getTime() < now,
    redemptionCount: countMap.get(r.id) ?? 0,
  }));
}

export type RedemptionRow = {
  id: string;
  code: string | null;
  couponKind: string;
  redeemerEmail: string | null;
  ownerEmail: string | null;
  recipientCreditedEur: number;
  referrerRewardEur: number;
  referrerRewardStatus: string;
  redeemedAt: Date;
};

/** Recent redemptions: who redeemed which code, and the referrer reward status. */
export async function listRedemptions(limit = 200): Promise<RedemptionRow[]> {
  const redeemer = alias(users, "redeemer");
  const owner = alias(users, "owner");
  const rows = await db
    .select({
      id: couponRedemptions.id,
      code: coupons.code,
      couponKind: couponRedemptions.couponKind,
      redeemerEmail: redeemer.email,
      ownerEmail: owner.email,
      recipientCreditedEur: couponRedemptions.recipientCreditedEur,
      referrerRewardEur: couponRedemptions.referrerRewardEur,
      referrerRewardStatus: couponRedemptions.referrerRewardStatus,
      redeemedAt: couponRedemptions.redeemedAt,
    })
    .from(couponRedemptions)
    .leftJoin(coupons, eq(couponRedemptions.couponId, coupons.id))
    .leftJoin(redeemer, eq(couponRedemptions.redeemerId, redeemer.id))
    .leftJoin(owner, eq(couponRedemptions.ownerId, owner.id))
    .orderBy(desc(couponRedemptions.redeemedAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    recipientCreditedEur: Number(r.recipientCreditedEur),
    referrerRewardEur: Number(r.referrerRewardEur),
  }));
}

export type ErrorLogRow = {
  id: string;
  scope: string;
  projectId: string | null;
  projectName: string | null;
  userId: string | null;
  userEmail: string | null;
  message: string;
  stack: string | null;
  context: string | null;
  createdAt: Date;
};

/**
 * Recent server-side errors (newest first), joined to the affected app + builder
 * user when known. projectId/userId are plain columns (the log outlives the rows
 * they point at), so the joins are left joins and may resolve to null.
 */
export async function listErrorLogs(limit = 200): Promise<ErrorLogRow[]> {
  return db
    .select({
      id: errorLogs.id,
      scope: errorLogs.scope,
      projectId: errorLogs.projectId,
      projectName: projects.name,
      userId: errorLogs.userId,
      userEmail: users.email,
      message: errorLogs.message,
      stack: errorLogs.stack,
      context: errorLogs.context,
      createdAt: errorLogs.createdAt,
    })
    .from(errorLogs)
    .leftJoin(projects, eq(errorLogs.projectId, projects.id))
    .leftJoin(users, eq(errorLogs.userId, users.id))
    .orderBy(desc(errorLogs.createdAt))
    .limit(limit);
}
