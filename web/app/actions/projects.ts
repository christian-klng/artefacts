"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  createProject,
  renameProject,
  deleteProject,
  listProjects,
} from "@/lib/projects";

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
