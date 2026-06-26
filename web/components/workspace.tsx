"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChatPanel, type ChatMessage } from "./chat-panel";
import { filesSignature } from "@/lib/files-signature";
import {
  WorkspaceToolbar,
  type Version,
  type ViewMode,
} from "./workspace-toolbar";
import {
  publishProjectAction,
  unpublishProjectAction,
  setPublishSlugAction,
} from "@/app/actions/projects";

// Sandpack is heavy and browser-only — load it client-side only.
const SandpackWorkspace = dynamic(
  () => import("./sandpack-workspace").then((m) => m.SandpackWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading workspace…
      </div>
    ),
  },
);

// crypto.randomUUID exists only in a secure context (HTTPS/localhost); fall
// back so the app also works when served over plain HTTP.
function genId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const TOOL_ICONS: Record<string, string> = {
  write_file: "✏️",
  edit_file: "✏️",
  read_file: "👀",
  list_files: "📂",
  delete_file: "🗑️",
};

type AgentEvent =
  | { type: "project"; id: string }
  | { type: "assistant_text"; text: string }
  | { type: "tool_use"; tool: string; path?: string }
  | { type: "file_changed"; path: string; content: string }
  | { type: "file_deleted"; path: string }
  | { type: "files"; files: { path: string; content: string }[] }
  | { type: "version"; id: string; label: string | null; createdAt: string }
  | { type: "error"; message: string }
  | { type: "done" };

export function Workspace({
  projectId,
  initialFiles,
  initialMessages,
  initialVersions,
  previewUrl,
  publishEnabled = false,
  initialPublishUrl,
  initialPublishedSignature,
}: {
  projectId: string;
  initialFiles: Record<string, string>;
  initialMessages: ChatMessage[];
  initialVersions: Version[];
  previewUrl?: string;
  publishEnabled?: boolean;
  initialPublishUrl?: string;
  initialPublishedSignature?: string;
}) {
  const [files, setFiles] = useState<Record<string, string>>(initialFiles);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [versions, setVersions] = useState<Version[]>(initialVersions);
  const [streaming, setStreaming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [view, setView] = useState<ViewMode>("preview");
  const [publishUrl, setPublishUrl] = useState<string | undefined>(
    initialPublishUrl,
  );
  const [publishing, setPublishing] = useState(false);
  // Signature of the published snapshot; compared against the live files to tell
  // whether the public app is behind the current code.
  const [publishedSignature, setPublishedSignature] = useState<
    string | undefined
  >(initialPublishedSignature);
  const currentSignature = useMemo(() => filesSignature(files), [files]);
  const publishDirty = !!publishUrl && publishedSignature !== currentSignature;

  const appendMessage = useCallback(
    (role: ChatMessage["role"], content: string) => {
      setMessages((prev) => [...prev, { id: genId(), role, content }]);
    },
    [],
  );

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "assistant_text":
          // Append to the in-progress assistant bubble, or start a new one if
          // the previous item was a tool line / user message.
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) =>
                i === prev.length - 1
                  ? { ...m, content: m.content + event.text }
                  : m,
              );
            }
            return [
              ...prev,
              { id: genId(), role: "assistant", content: event.text },
            ];
          });
          break;
        case "tool_use": {
          const icon = TOOL_ICONS[event.tool] ?? "🔧";
          const label = `${icon} ${event.tool}${event.path ? ` ${event.path}` : ""}`;
          appendMessage("tool", label);
          break;
        }
        case "file_changed":
          setFiles((prev) => ({ ...prev, [event.path]: event.content }));
          break;
        case "file_deleted":
          setFiles((prev) => {
            const next = { ...prev };
            delete next[event.path];
            return next;
          });
          break;
        case "files":
          setFiles(
            Object.fromEntries(event.files.map((f) => [f.path, f.content])),
          );
          break;
        case "version":
          setVersions((prev) => [
            { id: event.id, label: event.label, createdAt: event.createdAt },
            ...prev,
          ]);
          break;
        case "error":
          appendMessage("assistant", `⚠️ ${event.message}`);
          break;
      }
    },
    [appendMessage],
  );

  const onDownload = useCallback(() => {
    const html = files["/index.html"];
    if (!html) return;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "index.html",
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [files]);

  const onRestore = useCallback(
    async (versionId: string) => {
      setRestoring(true);
      try {
        const res = await fetch("/api/projects/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, versionId }),
        });
        if (!res.ok) throw new Error(`Restore failed (${res.status})`);
        const data = (await res.json()) as { files: Record<string, string> };
        setFiles(data.files);
      } catch (error) {
        appendMessage(
          "assistant",
          `⚠️ ${error instanceof Error ? error.message : "Restore failed"}`,
        );
      } finally {
        setRestoring(false);
      }
    },
    [projectId, appendMessage],
  );

  const onPublish = useCallback(async () => {
    setPublishing(true);
    try {
      const result = await publishProjectAction(projectId);
      if ("error" in result) {
        appendMessage("assistant", `⚠️ ${result.error}`);
      } else {
        setPublishUrl(result.url);
        // Publish froze exactly the current files → now in sync.
        setPublishedSignature(currentSignature);
      }
    } catch {
      appendMessage("assistant", "⚠️ Publish failed");
    } finally {
      setPublishing(false);
    }
  }, [projectId, appendMessage, currentSignature]);

  const onUnpublish = useCallback(async () => {
    setPublishing(true);
    try {
      await unpublishProjectAction(projectId);
      setPublishUrl(undefined);
    } catch {
      appendMessage("assistant", "⚠️ Unpublish failed");
    } finally {
      setPublishing(false);
    }
  }, [projectId, appendMessage]);

  // Returns an error string for inline display, or undefined on success.
  const onSetSlug = useCallback(
    async (desired: string): Promise<string | undefined> => {
      const result = await setPublishSlugAction(projectId, desired);
      if ("error" in result) return result.error;
      setPublishUrl(result.url);
      return undefined;
    },
    [projectId],
  );

  const onSend = useCallback(
    async (text: string) => {
      appendMessage("user", text);
      setStreaming(true);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, projectId }),
        });
        if (!res.ok || !res.body) {
          throw new Error(`Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;
            handleEvent(JSON.parse(line.slice(5).trim()) as AgentEvent);
          }
        }
      } catch (error) {
        handleEvent({
          type: "error",
          message: error instanceof Error ? error.message : "Agent error",
        });
      } finally {
        setStreaming(false);
      }
    },
    [projectId, appendMessage, handleEvent],
  );

  return (
    <div className="grid h-full grid-cols-[minmax(300px,380px)_1fr]">
      <ChatPanel messages={messages} streaming={streaming} onSend={onSend} />
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <WorkspaceToolbar
          view={view}
          onViewChange={setView}
          canDownload={!!files["/index.html"]}
          onDownload={onDownload}
          versions={versions}
          onRestore={onRestore}
          busy={restoring || streaming}
          publishEnabled={publishEnabled}
          canPublish={!!files["/index.html"]}
          publishing={publishing}
          publishUrl={publishUrl}
          publishDirty={publishDirty}
          onPublish={onPublish}
          onUnpublish={onUnpublish}
          onSetSlug={onSetSlug}
        />
        <div className="min-h-0 flex-1">
          <SandpackWorkspace
            files={files}
            view={view}
            previewUrl={previewUrl}
          />
        </div>
      </div>
    </div>
  );
}
