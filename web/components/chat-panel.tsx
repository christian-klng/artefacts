"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Eye,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Paperclip,
  Pencil,
  TriangleAlert,
  Trash2,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AttachmentMeta } from "./attachments-view";
import { InterviewCard } from "./interview-card";
import type { InterviewSubmission } from "@/lib/interview";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  // For tool-log rows: the agent tool name, used to pick an icon.
  tool?: string;
  // "error" marks a client-side error/warning notice (danger style);
  // "interview" marks the first-prompt concept interview card, whose content
  // is a JSON InterviewState (lib/interview.ts).
  kind?: "error" | "interview";
  // Tool row whose input is still being generated (live progress, pulses).
  pending?: boolean;
};

// Agent tool → icon for the chat tool-log rows.
const TOOL_ICON: Record<string, LucideIcon> = {
  write_file: Pencil,
  edit_file: Pencil,
  read_file: Eye,
  list_files: FolderOpen,
  delete_file: Trash2,
  list_attachments: Paperclip,
  read_attachment: Paperclip,
  embed_attachment: ImageIcon,
};

export function ChatPanel({
  messages,
  streaming,
  projectId,
  onSend,
  onInterviewSubmit,
  onAttachmentsChanged,
  balanceEur,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  projectId: string;
  onSend: (text: string, attachmentIds: string[]) => void;
  /** Submits the concept-interview card (answers or skip). */
  onInterviewSubmit: (
    messageId: string,
    submission: InterviewSubmission,
  ) => void;
  onAttachmentsChanged: () => void;
  /** Spendable EUR credit, shown above the composer; null while loading. */
  balanceEur?: number | null;
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


  return (
    <div className="flex h-full min-h-0 flex-col border-r border-neutral-200 dark:border-neutral-800">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Describe the app you want to build.
          </p>
        )}
        {messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            streaming={streaming}
            onInterviewSubmit={onInterviewSubmit}
          />
        ))}
        {streaming && (
          <p className="animate-pulse pl-1 text-xs tabular-nums text-neutral-500">
            arbeitet… <WorkingTimer />
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div
        className="border-t border-neutral-200 p-3 dark:border-neutral-800"
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
                {a.kind === "image" ? (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <span className="max-w-[140px] truncate">{a.filename}</span>
                <button
                  onClick={() => removePending(a.id)}
                  className="text-neutral-400 hover:text-danger"
                  aria-label={`${a.filename} entfernen`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            ))}
            {uploading > 0 && (
              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                lädt hoch…
              </span>
            )}
            {uploadError && (
              <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
                {uploadError}
              </span>
            )}
          </div>
        )}
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
        <div
          className={`rounded-xl border bg-white p-2 shadow-sm dark:bg-neutral-950 ${
            dragOver
              ? "border-neutral-900 dark:border-white"
              : "border-neutral-300 focus-within:border-neutral-900 dark:border-neutral-700 dark:focus-within:border-white"
          }`}
        >
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
            className="w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading > 0}
                title="Datei anhängen"
                aria-label="Datei anhängen"
                className="inline-flex items-center justify-center rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-white"
              >
                <Paperclip className="h-4 w-4" aria-hidden />
              </button>
              {balanceEur != null && (
                <span
                  title="Verfügbares Guthaben"
                  className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400"
                >
                  Guthaben: €{balanceEur.toFixed(balanceEur < 0.01 ? 4 : 2)}
                </span>
              )}
            </div>
            <button
              onClick={submit}
              disabled={
                streaming ||
                uploading > 0 ||
                (input.trim() === "" && pending.length === 0)
              }
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {streaming ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * m:ss since mount. Rendered only while streaming — visible for the WHOLE run
 * (the old lastRole !== "assistant" condition hid the indicator after the
 * first sentence, right before the longest silent stretch, which read as "the
 * agent stopped"). Mounting fresh per run resets the clock without setState
 * in an effect body.
 */
function WorkingTimer() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(
      () => setElapsed(Math.floor((Date.now() - t0) / 1000)),
      1000,
    );
    return () => clearInterval(iv);
  }, []);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <>
      {m}:{String(s).padStart(2, "0")}
    </>
  );
}

function MessageRow({
  message,
  streaming,
  onInterviewSubmit,
}: {
  message: ChatMessage;
  streaming: boolean;
  onInterviewSubmit: (
    messageId: string,
    submission: InterviewSubmission,
  ) => void;
}) {
  // The first-prompt concept interview card (interactive while pending).
  if (message.kind === "interview") {
    return (
      <InterviewCard
        messageId={message.id}
        content={message.content}
        streaming={streaming}
        onSubmit={onInterviewSubmit}
      />
    );
  }

  if (message.role === "tool") {
    const Icon = (message.tool && TOOL_ICON[message.tool]) || Wrench;
    return (
      <div
        className={`flex items-center gap-1.5 pl-1 font-mono text-xs text-neutral-500 ${
          message.pending ? "animate-pulse" : ""
        }`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{message.content}</span>
      </div>
    );
  }

  // Client-side error/warning notice.
  if (message.kind === "error") {
    return (
      <div className="text-left">
        <div className="inline-flex max-w-[90%] items-start gap-1.5 rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="whitespace-pre-wrap">{message.content}</span>
        </div>
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
