"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { ChatPanel, type ChatMessage } from "./chat-panel";

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

type AgentEvent =
  | { type: "project"; id: string }
  | { type: "assistant_text"; text: string }
  | { type: "file_changed"; path: string; content: string }
  | { type: "file_deleted"; path: string }
  | { type: "files"; files: { path: string; content: string }[] }
  | { type: "error"; message: string }
  | { type: "done" };

export function Workspace({
  projectId,
  initialFiles,
  initialMessages,
}: {
  projectId: string;
  initialFiles: Record<string, string>;
  initialMessages: ChatMessage[];
}) {
  const [files, setFiles] = useState<Record<string, string>>(initialFiles);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);

  const handleEvent = useCallback((event: AgentEvent, assistantId: string) => {
    switch (event.type) {
      case "assistant_text":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + event.text }
              : m,
          ),
        );
        break;
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
      case "error":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `⚠️ ${event.message}` }
              : m,
          ),
        );
        break;
    }
  }, []);

  const onSend = useCallback(
    async (text: string) => {
      const assistantId = genId();
      setMessages((prev) => [
        ...prev,
        { id: genId(), role: "user", content: text },
        { id: assistantId, role: "assistant", content: "" },
      ]);
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
            const event = JSON.parse(line.slice(5).trim()) as AgentEvent;
            handleEvent(event, assistantId);
          }
        }
      } catch (error) {
        handleEvent(
          {
            type: "error",
            message: error instanceof Error ? error.message : "Agent error",
          },
          assistantId,
        );
      } finally {
        setStreaming(false);
      }
    },
    [projectId, handleEvent],
  );

  return (
    <div className="grid h-full grid-cols-[minmax(300px,380px)_1fr]">
      <ChatPanel messages={messages} streaming={streaming} onSend={onSend} />
      <div className="h-full overflow-hidden">
        <SandpackWorkspace files={files} />
      </div>
    </div>
  );
}
