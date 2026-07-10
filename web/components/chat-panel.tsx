"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Palette,
  Paperclip,
  Pencil,
  ReceiptEuro,
  Search,
  Send,
  Shapes,
  TriangleAlert,
  Trash2,
  Type,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AttachmentMeta } from "./attachments-view";
import { InterviewCard, InterviewModal } from "./interview-card";
import { parseInterviewState, type InterviewSubmission } from "@/lib/interview";
import { useMessages } from "@/lib/i18n/provider";

/** True while the interview row is still awaiting the user's choice. */
function interviewPending(content: string): boolean {
  return parseInterviewState(content)?.status === "pending";
}

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
  search_icons: Search,
  get_icons: Shapes,
  search_fonts: Search,
  add_font: Type,
  search_stock_photos: Search,
  add_stock_photo: ImageIcon,
  apply_schema: Database,
  // The DB-provisioned notice (database_changed SSE event).
  database: Database,
  // The per-turn cost line (live from the usage SSE event; restored from the
  // usage_event ledger on reload). Euro receipt — the plain Receipt glyph draws
  // a "$".
  usage: ReceiptEuro,
};

// Minimum consecutive tool rows before they fold into a collapsible group. Runs
// shorter than this render as individual lines (nothing to collapse).
const GROUP_MIN_RUN = 2;

// The noisy per-action tool rows we fold into a group. The cost line ("usage")
// and the DB notice ("database") are one-off milestones — kept standalone so
// they stay visible instead of vanishing into a collapsed run.
function isGroupableTool(message: ChatMessage): boolean {
  return (
    message.role === "tool" &&
    message.tool !== "usage" &&
    message.tool !== "database"
  );
}

// A chat item to render: either a normal message or a run of tool rows folded
// into one expandable group.
type RenderItem =
  | { kind: "single"; message: ChatMessage }
  | { kind: "group"; key: string; messages: ChatMessage[] };

// Partition the flat message list so consecutive groupable tool rows collapse
// into a group. Purely presentational — the message model is untouched, so this
// works identically for the live SSE stream and a reloaded transcript. The group
// key is the first row's id: stable while the run grows during streaming.
function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = [];
  let run: ChatMessage[] = [];
  const flush = () => {
    if (run.length >= GROUP_MIN_RUN) {
      items.push({ kind: "group", key: run[0].id, messages: run });
    } else {
      for (const msg of run) items.push({ kind: "single", message: msg });
    }
    run = [];
  };
  for (const msg of messages) {
    if (isGroupableTool(msg)) {
      run.push(msg);
    } else {
      flush();
      items.push({ kind: "single", message: msg });
    }
  }
  flush();
  return items;
}

// Turns a tool row into its human-readable label. The content always begins with
// the raw tool token (e.g. "write_file /index.html · 3.2 kB"); we swap that token
// for the localized name and keep the detail (path/size). Rows without a mapped
// name (cost line, DB notice, unknown tools) render their content verbatim, so
// nothing localized is ever baked into the persisted transcript.
function friendlyToolLabel(
  toolNames: Record<string, string>,
  message: ChatMessage,
): string {
  const raw = message.tool;
  const friendly = raw ? toolNames[raw] : undefined;
  if (!raw || !friendly) return message.content;
  let detail = message.content;
  if (detail === raw) detail = "";
  else if (detail.startsWith(`${raw} `)) detail = detail.slice(raw.length + 1);
  return detail ? `${friendly} ${detail}` : friendly;
}

export function ChatPanel({
  messages,
  streaming,
  interviewLoading = false,
  projectId,
  onSend,
  onInterviewSubmit,
  onAttachmentsChanged,
  balanceEur,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  /** True while the first-prompt design suggestions are being generated. */
  interviewLoading?: boolean;
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
  const m = useMessages();
  const [input, setInput] = useState("");
  // Files attached to the current draft (already uploaded; shown as chips).
  const [pending, setPending] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Which tool-run groups the user has expanded (keyed by the run's first-row
  // id). Default collapsed; a stable key keeps a group open while more tool rows
  // stream into it.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const renderItems = useMemo(() => buildRenderItems(messages), [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // The concept-interview modal. The interactive card lives here, not inline,
  // so auto-scroll never lands the user at the bottom of a tall card.
  const [openInterviewId, setOpenInterviewId] = useState<string | null>(null);
  const pendingInterview = messages.find(
    (msg) => msg.kind === "interview" && interviewPending(msg.content),
  );
  // Auto-open once per pending interview (live arrival or reload); the ref stops
  // it re-opening after the user closes the modal without answering.
  const autoOpenedRef = useRef<string | null>(null);
  const pendingInterviewId = pendingInterview?.id ?? null;
  useEffect(() => {
    if (pendingInterviewId && autoOpenedRef.current !== pendingInterviewId) {
      autoOpenedRef.current = pendingInterviewId;
      setOpenInterviewId(pendingInterviewId);
    }
  }, [pendingInterviewId]);

  const modalMessage =
    openInterviewId != null
      ? messages.find(
          (msg) => msg.id === openInterviewId && msg.kind === "interview",
        )
      : undefined;

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
          setUploadError(
            data?.error ??
              m.chat.uploadFailedStatus.replace("{status}", String(res.status)),
          );
          continue;
        }
        const { attachment } = (await res.json()) as {
          attachment: AttachmentMeta;
        };
        setPending((prev) => [...prev, attachment]);
        onAttachmentsChanged();
      } catch {
        setUploadError(m.chat.uploadFailed);
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
    const message = text || m.chat.attachmentOnlyMessage;
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
          <p className="text-sm text-neutral-500">{m.chat.empty}</p>
        )}
        {renderItems.map((item) =>
          item.kind === "group" ? (
            <ToolGroup
              key={item.key}
              messages={item.messages}
              expanded={expandedGroups.has(item.key)}
              onToggle={() => toggleGroup(item.key)}
            />
          ) : (
            <MessageRow
              key={item.message.id}
              message={item.message}
              onOpenInterview={setOpenInterviewId}
            />
          ),
        )}
        {interviewLoading ? (
          <div className="flex animate-pulse items-center gap-1.5 pl-1 font-mono text-xs text-neutral-500">
            <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{m.interview.generating}</span>
          </div>
        ) : streaming ? (
          <p className="animate-pulse pl-1 text-xs tabular-nums text-neutral-500">
            {m.chat.working} <WorkingTimer />
          </p>
        ) : null}
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
                  aria-label={m.chat.removeAttachment.replace("{name}", a.filename)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            ))}
            {uploading > 0 && (
              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                {m.chat.uploading}
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
            placeholder={m.chat.placeholder}
            className="w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading > 0}
                title={m.chat.attachFile}
                aria-label={m.chat.attachFile}
                className="inline-flex items-center justify-center rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-white"
              >
                <Paperclip className="h-4 w-4" aria-hidden />
              </button>
              {balanceEur != null && (
                <span
                  title={m.chat.balanceTitle}
                  className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400"
                >
                  {m.chat.balance.replace(
                    "{amount}",
                    `€${balanceEur.toFixed(balanceEur < 0.01 ? 4 : 2)}`,
                  )}
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
              title={streaming ? m.chat.working : m.chat.send}
              aria-label={streaming ? m.chat.working : m.chat.send}
              // While streaming the button is disabled but its spinner must stay
              // bright — so only dim it for the empty-input disabled state.
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 ${
                streaming ? "" : "disabled:opacity-50"
              }`}
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>

      {modalMessage && interviewPending(modalMessage.content) && (
        <InterviewModal
          messageId={modalMessage.id}
          content={modalMessage.content}
          streaming={streaming}
          onSubmit={onInterviewSubmit}
          onClose={() => setOpenInterviewId(null)}
        />
      )}
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
  onOpenInterview,
}: {
  message: ChatMessage;
  onOpenInterview: (id: string) => void;
}) {
  // The first-prompt concept interview: a compact inline footprint (chip while
  // pending, summary once answered). The choosing happens in the modal.
  if (message.kind === "interview") {
    return (
      <InterviewCard
        content={message.content}
        onOpen={() => onOpenInterview(message.id)}
      />
    );
  }

  if (message.role === "tool") {
    return <ToolLine message={message} className="pl-1" />;
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

// A single tool-log line: icon + localized name + detail, pulsing while its
// input is still being generated. Reused for standalone rows and inside a group.
function ToolLine({
  message,
  className = "",
}: {
  message: ChatMessage;
  className?: string;
}) {
  const m = useMessages();
  const Icon = (message.tool && TOOL_ICON[message.tool]) || Wrench;
  const label = friendlyToolLabel(
    m.chat.toolNames as Record<string, string>,
    message,
  );
  return (
    <div
      className={`flex items-center gap-1.5 font-mono text-xs text-neutral-500 ${
        message.pending ? "animate-pulse" : ""
      } ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  );
}

// A run of consecutive tool rows, collapsed to just the latest step with a "+N"
// counter so a build firing dozens of icon/photo/font calls stays readable.
// Clicking toggles an accordion that reveals every step. Collapsed by default —
// the pulsing header + rising counter is the "the agent is busy" signal.
function ToolGroup({
  messages,
  expanded,
  onToggle,
}: {
  messages: ChatMessage[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const m = useMessages();
  const last = messages[messages.length - 1];
  const hidden = messages.length - 1;
  const LastIcon = (last.tool && TOOL_ICON[last.tool]) || Wrench;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={m.chat.toolStepsToggle}
        className={`flex w-full items-center gap-1.5 pl-1 text-left font-mono text-xs text-neutral-500 ${
          !expanded && last.pending ? "animate-pulse" : ""
        }`}
      >
        {expanded ? (
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-neutral-400"
            aria-hidden
          />
        ) : (
          <LastIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate">
          {expanded
            ? m.chat.toolSteps.replace("{count}", String(messages.length))
            : friendlyToolLabel(
                m.chat.toolNames as Record<string, string>,
                last,
              )}
        </span>
        {!expanded && (
          <>
            <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-px text-[10px] text-neutral-500 dark:bg-neutral-800">
              +{hidden}
            </span>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-neutral-400"
              aria-hidden
            />
          </>
        )}
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 border-l border-neutral-200 pl-3 dark:border-neutral-800">
          {messages.map((msg) => (
            <ToolLine key={msg.id} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}
