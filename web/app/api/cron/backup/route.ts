import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, projectBackups } from "@/lib/db/schema";
import { createBackup } from "@/lib/backup";
import { verifyCronSecret } from "@/lib/cron-secret";
import { settingString } from "@/lib/settings";

// Daily full-backup trigger for every PUBLISHED project. Not a page — an
// internal endpoint hit once a day by an external scheduler (Coolify Scheduled
// Task) with the BACKUP_CRON_SECRET bearer. Stateless + idempotent so a retry or
// an overlapping tick can't double-create: it skips a project that already has a
// 'daily' backup dated today (UTC). createBackup prunes per-project internally.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export async function POST(request: Request) {
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!verifyCronSecret(provided)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Kill switch (admin-overridable). Default on.
  if ((await settingString("BACKUP_ENABLED", "true")) !== "true") {
    return Response.json({ skipped: true });
  }

  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.published, true));

  const now = new Date();
  let created = 0;
  for (const { id } of rows) {
    try {
      const last = await db.query.projectBackups.findFirst({
        where: and(
          eq(projectBackups.projectId, id),
          eq(projectBackups.kind, "daily"),
        ),
        orderBy: desc(projectBackups.createdAt),
      });
      if (last && sameUtcDay(last.createdAt, now)) continue; // already backed up today
      await createBackup(id, "daily");
      created += 1;
    } catch (e) {
      // One failing project must not abort the whole sweep.
      console.error("[cron/backup] failed for", id, e);
    }
  }
  return Response.json({ published: rows.length, created });
}
