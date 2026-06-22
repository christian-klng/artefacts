import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  ensureDefaultProject,
  listFiles,
  getMessages,
  listVersions,
} from "@/lib/projects";
import { Workspace } from "@/components/workspace";
import type { ChatMessage } from "@/components/chat-panel";

export default async function AppHomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const project = await ensureDefaultProject(session.user.id);
  const [fileRows, messageRows, versionRows] = await Promise.all([
    listFiles(project.id),
    getMessages(project.id),
    listVersions(project.id),
  ]);

  const files = Object.fromEntries(fileRows.map((f) => [f.path, f.content]));
  const messages: ChatMessage[] = messageRows.map((m) => ({
    id: m.id,
    role: m.role as ChatMessage["role"],
    content: m.content,
  }));
  const versions = versionRows.map((v) => ({
    id: v.id,
    label: v.label,
    createdAt: v.createdAt.toISOString(),
  }));

  return (
    <div className="h-full">
      <Workspace
        projectId={project.id}
        initialFiles={files}
        initialMessages={messages}
        initialVersions={versions}
      />
    </div>
  );
}
