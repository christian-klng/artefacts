import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminEditLog, projectBackups, projects } from "@/lib/db/schema";
import {
  listFiles,
  readFile,
  writeFile,
  renameProject,
  isDefaultProjectName,
  extractHtmlTitle,
} from "@/lib/projects";
import { createBackup } from "@/lib/backup";
import { generateThumbnail } from "@/lib/thumbnail";
import { CONCEPT_PATH, SEO_GEO_PATH } from "@/lib/concept";
import {
  evaluateSeo,
  composeSeoGeoMd,
  parseSiteType,
  siteTypeNeedsSeo,
} from "@/lib/seo-checklist";

// The MCP interface (lib/mcp/server.ts) bypasses the agent route, so a mutating
// tool must replicate that route's post-turn maintenance itself — otherwise an
// operator's edit would silently diverge from what a normal builder turn
// produces (no restore point, a stale OG thumbnail, an out-of-date SEO report, a
// still-"Untitled" name). It also records an operator-side audit row. Every hook
// is independently fail-safe: the user's file write already succeeded, so a
// maintenance error must never turn into a failed tool call.

// A recent snapshot (from any source) is already a valid pre-edit restore point,
// so we don't snapshot again within this window — it keeps a rapid support
// session from producing a full backup per keystroke.
const BACKUP_DEBOUNCE_MS = 2 * 60_000;

/**
 * Best-effort restore point taken BEFORE a mutation, debounced against the
 * project's newest backup. Called at the TOP of every mutating tool (before the
 * write lands), so the first edit in a support session captures the pre-edit
 * state the user can roll back to, while rapid follow-up edits reuse it. Never
 * throws.
 */
export async function snapshotBeforeMutation(projectId: string): Promise<void> {
  try {
    const [newest] = await db
      .select({ createdAt: projectBackups.createdAt })
      .from(projectBackups)
      .where(eq(projectBackups.projectId, projectId))
      .orderBy(desc(projectBackups.createdAt))
      .limit(1);
    if (
      newest &&
      Date.now() - newest.createdAt.getTime() < BACKUP_DEBOUNCE_MS
    ) {
      return; // a recent snapshot already captures the pre-edit state
    }
    await createBackup(projectId, "admin");
  } catch (e) {
    console.error("[mcp] pre-mutation backup failed", e);
  }
}

/**
 * Post-mutation maintenance. Always records the audit row; and only when the
 * entry document changed, regenerates the OG thumbnail, refreshes the SEO/GEO
 * report for websites, and adopts the <title> as the project name while it is
 * still a system default (mirrors app/api/agent/route.ts). Each step is
 * independently fail-safe.
 */
export async function afterMutation(args: {
  projectId: string;
  ownerId: string;
  action: "write" | "edit" | "delete";
  path: string;
  actor: string | null;
}): Promise<void> {
  const { projectId, ownerId, action, path, actor } = args;

  // Operator-side audit trail — deliberately NOT the user's chat transcript.
  try {
    await db.insert(adminEditLog).values({ projectId, action, path, actor });
  } catch (e) {
    console.error("[mcp] audit log write failed", e);
  }

  // The rest is entry-document maintenance only; a CSS/asset edit skips it,
  // exactly like the agent route's thumbnail scope.
  if (path !== "/index.html") return;

  // OG thumbnail — time-boxed + fail-safe inside generateThumbnail itself.
  try {
    await generateThumbnail(projectId);
  } catch (e) {
    console.error("[mcp] thumbnail regen failed", e);
  }

  // SEO/GEO report for websites — deterministic (no LLM), recomputed from the
  // live VFS. Reads CONCEPT fresh (the site-type marker may have just changed).
  try {
    const siteType = parseSiteType(await readFile(projectId, CONCEPT_PATH));
    if (siteTypeNeedsSeo(siteType)) {
      const [indexHtml, allFiles] = await Promise.all([
        readFile(projectId, "/index.html"),
        listFiles(projectId),
      ]);
      if (indexHtml) {
        const paths = new Set(allFiles.map((f) => f.path));
        const ev = evaluateSeo(indexHtml, {
          hasRobots: paths.has("/robots.txt"),
          hasSitemap: paths.has("/sitemap.xml"),
          hasLlms: paths.has("/llms.txt"),
        });
        // Lazy import: resolveLocale pulls in next/headers, which only resolves
        // inside the Next runtime — keeping it out of the static graph lets the
        // plain-node e2e harness import this module. Only reached for websites.
        const { resolveLocale } = await import("@/lib/locale");
        const locale = await resolveLocale().catch(() => "de" as const);
        await writeFile(projectId, SEO_GEO_PATH, composeSeoGeoMd(ev, { locale }));
      }
    }
  } catch (e) {
    console.error("[mcp] SEO report update failed", e);
  }

  // Adopt the generated <title> as the name while it is still a default — the
  // same at-most-once semantics the agent route relies on (renameProject is a
  // no-op once a real name is set). Scoped to the resolved owner.
  try {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { name: true },
    });
    if (project && isDefaultProjectName(project.name)) {
      const title = extractHtmlTitle((await readFile(projectId, "/index.html")) ?? "");
      if (title && title !== project.name) {
        await renameProject(projectId, ownerId, title);
      }
    }
  } catch (e) {
    console.error("[mcp] auto-name failed", e);
  }
}
