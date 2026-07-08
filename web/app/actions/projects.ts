"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createProject,
  renameProject,
  deleteProject,
  listProjects,
  publishProject,
  unpublishProject,
  setPublishSlug,
  setSiteUrl,
} from "@/lib/projects";
import { buildAppOrigin } from "@/lib/app-host";
import { generateThumbnail } from "@/lib/thumbnail";
import { normalizeSiteOrigin } from "@/lib/site-url";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

async function requireUserId() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user.id;
}

export async function createProjectAction() {
  const userId = await requireUserId();
  const project = await createProject(userId);
  // The new project must appear in the shared `/app` layout (ProjectSwitcher).
  // The redirect below is a soft client navigation that reuses the cached
  // layout, so without invalidating it the switcher never lists the new
  // project — its `active` lookup fails and the rename/delete controls (and the
  // header name) don't render until a hard refresh. Same reason as the rename
  // action revalidates below.
  revalidatePath("/app", "layout");
  redirect(`/app/${project.id}`);
}

export async function renameProjectAction(formData: FormData) {
  const userId = await requireUserId();
  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (projectId && name) {
    await renameProject(projectId, userId, name);
    // The project title is rendered in the shared `/app` layout
    // (ProjectSwitcher). We stay on the same URL, so without invalidating that
    // layout the header keeps the old name from the client Router Cache — the
    // rename looks like it did nothing. Refresh the layout for all `/app/*`.
    revalidatePath("/app", "layout");
  }
}

/**
 * Publishes the project and returns its public URL (or an error message).
 * `firstPublish` is true only for the project's very first publish — the
 * client celebrates that one with confetti.
 */
export async function publishProjectAction(
  projectId: string,
): Promise<{ url: string; firstPublish: boolean } | { error: string }> {
  const userId = await requireUserId();
  const t = getMessages(await resolveLocale()).toolbar;
  const appsDomain = process.env.APPS_DOMAIN;
  if (!appsDomain) {
    return { error: t.errPublishNotConfigured };
  }
  try {
    // Refresh the OG thumbnail from the current state BEFORE freezing the publish
    // snapshot, so the public app links an up-to-date screenshot. Best-effort:
    // publish must never fail because the screenshot service is down/slow.
    await generateThumbnail(projectId).catch(() => {});
    const { slug, firstPublish } = await publishProject(projectId, userId);
    return { url: buildAppOrigin(appsDomain, slug), firstPublish };
  } catch (e) {
    return { error: e instanceof Error ? e.message : t.errPublishFailed };
  }
}

/** Takes the project offline; keeps the slug for future re-publishing. */
export async function unpublishProjectAction(projectId: string): Promise<void> {
  const userId = await requireUserId();
  await unpublishProject(projectId, userId);
}

/** Sets a custom public address; checks availability and returns the new URL. */
export async function setPublishSlugAction(
  projectId: string,
  desired: string,
): Promise<{ url: string } | { error: string }> {
  const userId = await requireUserId();
  const t = getMessages(await resolveLocale()).toolbar;
  const appsDomain = process.env.APPS_DOMAIN;
  if (!appsDomain) {
    return { error: t.errPublishNotConfigured };
  }
  try {
    const result = await setPublishSlug(projectId, userId, desired);
    if ("error" in result) return result;
    return { url: buildAppOrigin(appsDomain, result.slug) };
  } catch {
    // Unique-constraint race: the slug was taken between check and write.
    return { error: t.errSlugTaken };
  }
}

/**
 * Remembers the public URL the user plans to deploy an export under (used to
 * fill the __SITE_URL__ placeholder in exported SEO files). Returns the
 * normalized origin, or an error if the input can't be parsed. Empty clears it.
 */
export async function setSiteUrlAction(
  projectId: string,
  rawUrl: string,
): Promise<{ origin: string | null } | { error: string }> {
  const userId = await requireUserId();
  const trimmed = rawUrl.trim();
  if (trimmed === "") {
    await setSiteUrl(projectId, userId, null);
    return { origin: null };
  }
  const origin = normalizeSiteOrigin(trimmed);
  if (!origin) {
    const t = getMessages(await resolveLocale()).toolbar;
    return { error: t.errInvalidUrl };
  }
  await setSiteUrl(projectId, userId, origin);
  return { origin };
}

export async function deleteProjectAction(formData: FormData) {
  const userId = await requireUserId();
  const projectId = String(formData.get("projectId") ?? "");
  if (projectId) {
    await deleteProject(projectId, userId);
  }
  // The deleted project must disappear from the shared `/app` layout
  // (ProjectSwitcher); the redirect is a soft navigation that would otherwise
  // reuse the cached layout and keep listing it. Invalidate as create/rename do.
  revalidatePath("/app", "layout");
  // Go to the most recent remaining project, or /app (which creates a default).
  const remaining = await listProjects(userId);
  redirect(
    remaining.length > 0 ? `/app/${remaining[remaining.length - 1].id}` : "/app",
  );
}
