import { auth } from "@/auth";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, subscriptions, users } from "@/lib/db/schema";
import { buildCheckoutLinks, withCheckoutParams } from "@/lib/stripe/links";
import { stripeSubscriptionLinkUrl } from "@/lib/cortecs/config";

// Everything the account "Abo & Guthaben" tab needs in one request: the
// (click-ready) top-up links, whether a billing portal is available, and the
// user's PUBLISHED apps with their hosting-subscription status + a per-app
// subscribe URL (client_reference_id = projectId, ownership enforced by the
// webhook). Read-only; the actual payment happens on Stripe's Payment Links.

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const email = session.user.email ?? null;

  const [links, subBase, apps, subs, userRows] = await Promise.all([
    buildCheckoutLinks({ userId, email }),
    stripeSubscriptionLinkUrl(),
    db
      .select({
        id: projects.id,
        name: projects.name,
        published: projects.published,
        hostingActive: projects.hostingActive,
      })
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt)),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)),
    db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId)),
  ]);

  const subByProject = new Map<string, (typeof subs)[number]>();
  for (const s of subs) if (s.projectId) subByProject.set(s.projectId, s);

  const appList = apps
    .filter((a) => a.published)
    .map((a) => {
      const sub = subByProject.get(a.id) ?? null;
      return {
        projectId: a.id,
        name: a.name,
        hostingActive: a.hostingActive,
        status: sub?.status ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd
          ? sub.currentPeriodEnd.toISOString()
          : null,
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
        subscribeUrl: subBase ? withCheckoutParams(subBase, a.id, email) : null,
      };
    });

  return Response.json({
    topupUrls: links.topupUrls,
    portalAvailable: !!userRows[0]?.stripeCustomerId,
    apps: appList,
  });
}
