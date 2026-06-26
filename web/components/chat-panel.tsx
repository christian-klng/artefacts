"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AttachmentMeta } from "./attachments-view";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};

export function ChatPanel({
  messages,
  streaming,
  projectId,
  onSend,
  onAttachmentsChanged,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  projectId: string;
  onSend: (text: string, attachmentIds: string[]) => void;
  onAttachmentsChanged: () => void;
}) {
  const [input, setInput] = useState("");
  // Files attached to the current draft (already uploaded; shown as chips).
  const [pending, setPending] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploadError(null);
    for (const file of list) {
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("projectId", projectId);
        const res = await fetch("/api/attachments", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setUploadError(data?.error ?? `Upload fehlgeschlagen (${res.status})`);
          continue;
        }
        const { attachment } = (await res.json()) as {
          attachment: AttachmentMeta;
        };
        setPending((prev) => [...prev, attachment]);
        onAttachmentsChanged();
      } catch {
        setUploadError("Upload fehlgeschlagen");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function removePending(id: string) {
    setPending((prev) => prev.filter((a) => a.id !== id));
    await fetch(
      `/api/attachments/${id}?projectId=${encodeURIComponent(projectId)}`,
      { method: "DELETE" },
    ).catch(() => {});
    onAttachmentsChanged();
  }

  function submit() {
    const text = input.trim();
    if (streaming || uploading > 0) return;
    if (!text && pending.length === 0) return;
    // Allow attachment-only turns by supplying a default instruction.
    const message =
      text || "Bitte berücksichtige die hochgeladenen Dateien.";
    onSend(
      message,
      pending.map((a) => a.id),
    );
    setInput("");
    setPending([]);
    setUploadError(null);
  }

  const lastRole = messages[messages.length - 1]?.role;
  const showWorking = streaming && lastRole !== "assistant";

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-neutral-200 dark:border-neutral-800">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Describe the app you want to build.
          </p>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        {showWorking && (
          <p className="animate-pulse pl-1 text-xs text-neutral-500">
            arbeitet…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div
        className={`border-t p-3 ${
          dragOver
            ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-900"
            : "border-neutral-200 dark:border-neutral-800"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
        }}
      >
        {(pending.length > 0 || uploading > 0 || uploadError) && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pending.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800"
                title={a.filename}
              >
                <span>{a.kind === "image" ? "🖼️" : "📄"}</span>
                <span className="max-w-[140px] truncate">{a.filename}</span>
                <button
                  onClick={() => removePending(a.id)}
                  className="text-neutral-400 hover:text-red-600"
                  aria-label={`${a.filename} entfernen`}
                >
                  ×
                </button>
              </span>
            ))}
            {uploading > 0 && (
              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                lädt hoch…
              </span>
            )}
            {uploadError && (
              <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600 dark:bg-red-950">
                {uploadError}
              </span>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading > 0}
            title="Datei anhängen"
            aria-label="Datei anhängen"
            className="rounded-md border border-neutral-300 px-2.5 py-2 text-sm text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white"
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                uploadFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder="Build a pomodoro timer…"
            className="flex-1 resize-none rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-white"
          />
          <button
            onClick={submit}
            disabled={
              streaming ||
              uploading > 0 ||
              (input.trim() === "" && pending.length === 0)
            }
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {streaming ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "tool") {
    return (
      <div className="pl-1 font-mono text-xs text-neutral-500">
        {message.content}
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="text-right">
        <div className="inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-neutral-900">
          {message.content}
        </div>
      </div>
    );
  }

  // assistant / system — render Markdown
  return (
    <div className="text-left">
      <div className="inline-block max-w-[90%] rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100">
        <div className="prose prose-sm max-w-none dark:prose-invert [&_*:first-child]:mt-0 [&_*:last-child]:mb-0 [&_pre]:overflow-x-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: (props) => (
                <a {...props} target="_blank" rel="noopener noreferrer" />
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
