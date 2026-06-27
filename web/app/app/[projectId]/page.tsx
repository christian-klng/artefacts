import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getOwnedProject,
  getClientFiles,
  getMessages,
  listVersions,
  getPublishedSignature,
} from "@/lib/projects";
import { listAttachments } from "@/lib/attachments";
import { Workspace } from "@/components/workspace";
import type { ChatMessage } from "@/components/chat-panel";
import { signPreviewToken } from "@/lib/preview-token";
import { buildAppOrigin } from "@/lib/app-host";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { projectId } = await params;
  const { run } = await searchParams;
  const project = await getOwnedProject(projectId, session.user.id).catch(
    () => null,
  );
  if (!project) redirect("/app");

  const [clientFiles, messageRows, versionRows, attachmentRows] =
    await Promise.all([
      getClientFiles(project.id),
      getMessages(project.id),
      listVersions(project.id),
      listAttachments(project.id),
    ]);

  const { files, assets } = clientFiles;
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
  const attachments = attachmentRows.map((a) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    kind: a.kind,
    size: a.size,
    createdAt: a.createdAt.toISOString(),
    preview: a.preview,
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

  // Arriving from the landing-page handoff (/start → ?run=1): the visitor's
  // prompt is parked in an HttpOnly cookie. Hand it to the workspace as the
  // initial message; the client fires it once and clears the cookie.
  const initialPrompt =
    run === "1"
      ? (await cookies()).get("kk_pending_prompt")?.value
      : undefined;

  return (
    <div className="h-full">
      {/* key remounts the workspace cleanly when switching projects */}
      <Workspace
        key={project.id}
        projectId={project.id}
        initialFiles={files}
        initialAssets={assets}
        initialMessages={messages}
        initialVersions={versions}
        initialAttachments={attachments}
        previewUrl={previewUrl}
        publishEnabled={!!appsDomain}
        initialPublishUrl={publishUrl}
        initialPublishedSignature={publishedSignature}
        initialPrompt={initialPrompt}
      />
    </div>
  );
}
