import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getOwnedProject,
  listFiles,
  getMessages,
  listVersions,
  getPublishedSignature,
} from "@/lib/projects";
import { Workspace } from "@/components/workspace";
import type { ChatMessage } from "@/components/chat-panel";
import { signPreviewToken } from "@/lib/preview-token";
import { buildAppOrigin } from "@/lib/app-host";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { projectId } = await params;
  const project = await getOwnedProject(projectId, session.user.id).catch(
    () => null,
  );
  if (!project) redirect("/app");

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

  // When an apps sub-zone is configured, the preview is served from the
  // project's own origin (real DB/auth possible). A signed token authorizes
  // viewing cross-origin. Without APPS_DOMAIN we fall back to the srcDoc preview.
  const appsDomain = process.env.APPS_DOMAIN;
  const previewUrl = appsDomain
    ? `${buildAppOrigin(appsDomain, `preview-${project.id}`)}/?pt=${encodeURIComponent(
        signPreviewToken(project.id),
      )}`
    : undefined;

  // Publishing serves a frozen snapshot from <slug>.apps.<domain>; only offered
  // when the apps sub-zone is configured.
  const publishUrl =
    appsDomain && project.published && project.publishSlug
      ? buildAppOrigin(appsDomain, project.publishSlug)
      : undefined;
  // Fingerprint of the published snapshot, so the client can tell whether the
  // live files have drifted since (→ "Aktualisieren" vs "Aktueller Stand").
  const publishedSignature = project.published
    ? ((await getPublishedSignature(project.id)) ?? undefined)
    : undefined;

  return (
    <div className="h-full">
      {/* key remounts the workspace cleanly when switching projects */}
      <Workspace
        key={project.id}
        projectId={project.id}
        initialFiles={files}
        initialMessages={messages}
        initialVersions={versions}
        previewUrl={previewUrl}
        publishEnabled={!!appsDomain}
        initialPublishUrl={publishUrl}
        initialPublishedSignature={publishedSignature}
      />
    </div>
  );
}
