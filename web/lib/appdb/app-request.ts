import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import {
  parseAppLabel,
  previewProjectId,
  publishSlugFromLabel,
} from "@/lib/app-host";
import { verifyPreviewToken } from "@/lib/preview-token";

// Resolves which generated app an /api/appdb or /api/appauth request belongs to,
// from its Host, and applies the same gating the serve route uses:
//   - preview-<id> hosts are the builder's private view → require the signed
//     preview token (sent as the `pt` cookie the serve route set on that host);
//   - published <slug> hosts are public → no gate (the app's own end-user auth
//     and RLS do the access control).
// These routes are NOT rewritten by proxy.ts (the matcher excludes /api), so the
// real Host arrives directly; x-app-host is honored first only for symmetry.

export type AppContext = { projectId: string; databaseEnabled: boolean };

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function resolveAppContext(
  request: Request,
): Promise<{ ctx: AppContext } | { error: Response }> {
  const host = request.headers.get("x-app-host") || request.headers.get("host");
  const appsDomain = process.env.APPS_DOMAIN ?? "";
  const label = parseAppLabel(host, appsDomain);
  if (!label) return { error: new Response("Not found", { status: 404 }) };

  const previewId = previewProjectId(label);
  if (previewId) {
    const url = new URL(request.url);
    const token =
      url.searchParams.get("pt") ??
      readCookie(request.headers.get("cookie"), "pt");
    if (verifyPreviewToken(token) !== previewId) {
      return { error: new Response("Forbidden", { status: 403 }) };
    }
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, previewId),
    });
    if (!project) return { error: new Response("Not found", { status: 404 }) };
    return {
      ctx: { projectId: project.id, databaseEnabled: project.databaseEnabled },
    };
  }

  const slug = publishSlugFromLabel(label);
  if (slug) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.publishSlug, slug), eq(projects.published, true)),
    });
    if (project) {
      return {
        ctx: { projectId: project.id, databaseEnabled: project.databaseEnabled },
      };
    }
  }

  return { error: new Response("Not found", { status: 404 }) };
}
