import { desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { projects, userCredits, usageEvents, users } from "./schema";

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
  createdAt: Date;
  updatedAt: Date;
  ownerEmail: string | null;
  ownerName: string | null;
};

/** All projects with their owner, newest activity first. */
export async function listApps(): Promise<AppRow[]> {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      template: projects.template,
      published: projects.published,
      publishSlug: projects.publishSlug,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      ownerEmail: users.email,
      ownerName: users.name,
    })
    .from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .orderBy(desc(projects.updatedAt));
}

export type Totals = {
  userCount: number;
  appCount: number;
  publishedCount: number;
  consumedEur: number;
  balanceEur: number;
};

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
