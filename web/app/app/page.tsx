import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensureDefaultProject } from "@/lib/projects";

// /app has no workspace of its own — it sends you to your most recent project
// (creating one on first use).
export default async function AppIndex() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const project = await ensureDefaultProject(session.user.id);
  redirect(`/app/${project.id}`);
}
