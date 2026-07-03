"use server";

import { redirect } from "next/navigation";
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
import { normalizeSiteOrigin } from "@/lib/site-url";

async function requireUserId() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user.id;
}

export async function createProjectAction() {
  const userId = await requireUserId();
  const project = await createProject(userId);
  redirect(`/app/${project.id}`);
}

export async function renameProjectAction(formData: FormData) {
  const userId = await requireUserId();
  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (projectId && name) {
    await renameProject(projectId, userId, name);
  }
  redirect(projectId ? `/app/${projectId}` : "/app");
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
  const appsDomain = process.env.APPS_DOMAIN;
  if (!appsDomain) {
    return { error: "Publishing is not configured on this instance." };
  }
  try {
    const { slug, firstPublish } = await publishProject(projectId, userId);
    return { url: buildAppOrigin(appsDomain, slug), firstPublish };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Publish failed" };
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
  const appsDomain = process.env.APPS_DOMAIN;
  if (!appsDomain) {
    return { error: "Publishing is not configured on this instance." };
  }
  try {
    const result = await setPublishSlug(projectId, userId, desired);
    if ("error" in result) return result;
    return { url: buildAppOrigin(appsDomain, result.slug) };
  } catch {
    // Unique-constraint race: the slug was taken between check and write.
    return { error: "Diese Adresse ist bereits vergeben." };
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
  if (!origin) return { error: "Bitte eine gültige URL eingeben." };
  await setSiteUrl(projectId, userId, origin);
  return { origin };
}

export async function deleteProjectAction(formData: FormData) {
  const userId = await requireUserId();
  const projectId = String(formData.get("projectId") ?? "");
  if (projectId) {
    await deleteProject(projectId, userId);
  }
  // Go to the most recent remaining project, or /app (which creates a default).
  const remaining = await listProjects(userId);
  redirect(
    remaining.length > 0 ? `/app/${remaining[remaining.length - 1].id}` : "/app",
  );
}
