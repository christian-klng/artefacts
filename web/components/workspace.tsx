"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { clearPendingPrompt } from "@/app/actions/start";
import { ChatPanel, type ChatMessage } from "./chat-panel";
import { AttachmentsView, type AttachmentMeta } from "./attachments-view";
import { ConfettiBurst } from "./confetti";
import { DataView } from "./data-view";
import type { AssetMeta } from "./sandpack-workspace";
import { canonicalSignatureMap, filesSignature } from "@/lib/files-signature";
import {
  WorkspaceToolbar,
  type DeviceMode,
  type Version,
  type ViewMode,
} from "./workspace-toolbar";
import {
  publishProjectAction,
  unpublishProjectAction,
  setPublishSlugAction,
  setSiteUrlAction,
} from "@/app/actions/projects";
import { substituteSiteUrl, normalizeSiteOrigin } from "@/lib/site-url";
import { CREDIT_CHANGED_EVENT } from "@/lib/credit-events";
import { formatEur } from "@/lib/eur";
import { useMessages } from "@/lib/i18n/provider";
import {
  parseInterviewState,
  type InterviewSpec,
  type InterviewState,
  type InterviewSubmission,
} from "@/lib/interview";

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
  // A tool_use block started streaming its input — shown as a pending row
  // long before the input is complete (a large write_file takes minutes).
  | { type: "tool_start"; tool: string }
  // Throttled generation progress for that block (path appears once sniffed).
  | { type: "tool_progress"; tool: string; path?: string; chars: number }
  | { type: "tool_use"; tool: string; path?: string }
  | { type: "file_changed"; path: string; content: string }
  | { type: "asset_changed"; path: string; asset: AssetMeta }
  | { type: "file_deleted"; path: string }
  | {
      type: "files";
      files: Record<string, string>;
      assets: Record<string, AssetMeta>;
      // Agent-memory files (/CONCEPT.md, /DESIGN.md) — read-only in the code tree.
      internal: Record<string, string>;
    }
  | {
      type: "version";
      id: string;
      kind: string;
      label: string | null;
      createdAt: string;
    }
  // The first-prompt concept interview card (3 questions + style choice).
  | { type: "interview"; id: string; spec: InterviewSpec }
  | { type: "attachments_changed" }
  | { type: "database_changed"; tables: string[] }
  | {
      type: "usage";
      model: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      billedEur: number;
      balanceEur: number;
    }
  | { type: "error"; message: string }
  | { type: "done" };


/** Rough size of the tool input generated so far, for the progress rows. */
function formatKb(chars: number): string {
  if (chars < 1024) return `${chars} B`;
  const kb = chars / 1024;
  return `${kb >= 100 ? Math.round(kb) : kb.toFixed(1).replace(".", ",")} kB`;
}

export function Workspace({
  projectId,
  initialFiles,
  initialMessages,
  initialVersions,
  initialAttachments = [],
  initialAssets = {},
  initialInternal = {},
  previewUrl,
  publishEnabled = false,
  initialPublishUrl,
  initialPublishedSignature,
  initialSiteUrl,
  initialDatabaseEnabled = false,
  showBadge = true,
  initialPrompt,
}: {
  projectId: string;
  initialFiles: Record<string, string>;
  initialMessages: ChatMessage[];
  initialVersions: Version[];
  initialAttachments?: AttachmentMeta[];
  initialAssets?: Record<string, AssetMeta>;
  // Agent-memory files (/CONCEPT.md, /DESIGN.md), shown read-only in the code tree.
  initialInternal?: Record<string, string>;
  previewUrl?: string;
  publishEnabled?: boolean;
  initialPublishUrl?: string;
  initialPublishedSignature?: string;
  // The public URL the user last set for exports (pre-fills the export dialog).
  initialSiteUrl?: string;
  // Whether the project already has a provisioned database (shows the Daten tab).
  initialDatabaseEnabled?: boolean;
  // Whether the "Erstellt mit Kubikraum" badge shows in the preview. Only affects
  // the srcDoc fallback (no APPS_DOMAIN); with a real preview origin the serve
  // route injects it. Default true.
  showBadge?: boolean;
  // Prompt carried over from the landing page (via /start). Fired once on mount
  // as the first agent message, then cleared.
  initialPrompt?: string;
}) {
  const m = useMessages();
  const router = useRouter();
  const [files, setFiles] = useState<Record<string, string>>(initialFiles);
  const [assets, setAssets] =
    useState<Record<string, AssetMeta>>(initialAssets);
  // Agent-memory files (/CONCEPT.md, /DESIGN.md): a separate channel so they show
  // read-only in the code tree without touching the preview or publish signature.
  const [internal, setInternal] =
    useState<Record<string, string>>(initialInternal);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [versions, setVersions] = useState<Version[]>(initialVersions);
  const [attachments, setAttachments] =
    useState<AttachmentMeta[]>(initialAttachments);
  const [streaming, setStreaming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // Spendable EUR credit. Hydrated on mount and updated after every billed turn.
  const [balanceEur, setBalanceEur] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("preview");
  // Preview viewport size (desktop/tablet/mobile) for the responsiveness switcher
  // in the toolbar. Only affects the preview iframe's dimensions.
  const [device, setDevice] = useState<DeviceMode>("desktop");
  // Live-build highlights for the code tree. `activePath` = the file the agent is
  // currently writing (yellow); `doneTicks` bumps per path on each committed write
  // to replay the green "done" flash (see file-tree.tsx).
  const [activePath, setActivePath] = useState<string | null>(null);
  const [doneTicks, setDoneTicks] = useState<Record<string, number>>({});
  // Auto-view-switch bookkeeping (maybeAutoSwitchToCode / …ReturnToPreview below).
  // `viewRef`/`hasIndexRef` mirror state so the SSE handler reads fresh values
  // without adding churny deps; the two flags are reset at the start of each turn.
  const manualViewRef = useRef(false); // user picked a view during this turn
  const didAutoSwitchRef = useRef(false); // we switched preview→code this turn
  const viewRef = useRef<ViewMode>(view);
  const hasIndexRef = useRef(!!initialFiles["/index.html"]);
  // Whether the Daten tab is shown; flips true when the agent provisions a DB.
  const [hasDatabase, setHasDatabase] = useState(initialDatabaseEnabled);
  // Bumped on each schema change so an open data viewer refetches.
  const [dbRefreshKey, setDbRefreshKey] = useState(0);
  // Preview origin + signed token for the subdomain iframe. Seeded from the
  // server render but refreshed client-side (below): the server-baked token has
  // a 1h TTL yet the page render is cacheable (prefetch + soft navigations keep
  // it in the client Router Cache), so a long-lived tab could otherwise end up
  // with an expired token and the preview 403s ("Forbidden") until a hard reload.
  const [preview, setPreview] = useState<string | undefined>(previewUrl);
  const [publishUrl, setPublishUrl] = useState<string | undefined>(
    initialPublishUrl,
  );
  const [publishing, setPublishing] = useState(false);
  // One-shot confetti over the whole builder, fired on the first publish ever.
  const [celebrating, setCelebrating] = useState(false);
  // Signature of the published snapshot; compared against the live files to tell
  // whether the public app is behind the current code.
  const [publishedSignature, setPublishedSignature] = useState<
    string | undefined
  >(initialPublishedSignature);
  // Remembered export target URL; pre-fills the export dialog next time.
  const [siteUrl, setSiteUrlState] = useState<string | undefined>(
    initialSiteUrl,
  );
  const currentSignature = useMemo(
    () => filesSignature(canonicalSignatureMap(files, assets)),
    [files, assets],
  );
  const publishDirty = !!publishUrl && publishedSignature !== currentSignature;
  // The "Dateien" tab is only shown while attachments exist. If the last one is
  // deleted while that tab is active, render the preview instead so the user
  // isn't stranded on a now-hidden, empty view. Derived (not stored) so it can't
  // go stale — re-uploading a file restores the still-remembered "files" view.
  const effectiveView =
    view === "files" && attachments.length === 0 ? "preview" : view;

  // Mirror view + index.html presence into refs so the SSE handler's auto-switch
  // logic reads the current value without re-creating the handler on every change.
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    hasIndexRef.current = !!files["/index.html"];
  }, [files]);

  const appendMessage = useCallback(
    (
      role: ChatMessage["role"],
      content: string,
      extra?: Partial<ChatMessage>,
    ) => {
      setMessages((prev) => [...prev, { id: genId(), role, content, ...extra }]);
    },
    [],
  );

  // Re-fetch the attachment list after an upload or delete. The initial list is
  // hydrated from the server (page.tsx), so no mount fetch is needed.
  const refreshAttachments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/attachments?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { attachments: AttachmentMeta[] };
      setAttachments(data.attachments);
    } catch {
      // Non-fatal: the list just won't refresh.
    }
  }, [projectId]);

  // Switch to the code view the first time a turn touches a file, so the user
  // watches files light up as they're written. Only from "preview" (don't yank
  // the user off Daten/Dateien) and never if they've manually picked a view.
  const maybeAutoSwitchToCode = useCallback(() => {
    if (manualViewRef.current || didAutoSwitchRef.current) return;
    if (viewRef.current === "preview") {
      didAutoSwitchRef.current = true;
      setView("code");
    }
  }, []);

  // When the turn ends, return to the preview so the finished app is shown — but
  // only if WE auto-switched to code and the user hasn't overridden the view since.
  const maybeAutoReturnToPreview = useCallback(() => {
    if (!didAutoSwitchRef.current || manualViewRef.current) return;
    if (hasIndexRef.current && viewRef.current === "code") setView("preview");
  }, []);

  // A file write committed: replay its green flash and clear its editing state.
  const markFileDone = useCallback((path: string) => {
    setDoneTicks((prev) => ({ ...prev, [path]: (prev[path] ?? 0) + 1 }));
    setActivePath((cur) => (cur === path ? null : cur));
  }, []);

  // Marks the user as having chosen the view, which stops auto-switching for the
  // rest of the turn. Passed to the toolbar in place of the raw setView.
  const handleUserViewChange = useCallback((next: ViewMode) => {
    manualViewRef.current = true;
    setView(next);
  }, []);

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
        case "tool_start":
          appendMessage("tool", event.tool, { tool: event.tool, pending: true });
          break;
        case "tool_progress": {
          const label = `${event.tool}${event.path ? ` ${event.path}` : ""} · ${formatKb(event.chars)}`;
          setMessages((prev) => {
            // Update the newest pending row — the block currently streaming.
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === "tool" && prev[i].pending) {
                return prev.map((m, j) =>
                  j === i ? { ...m, content: label } : m,
                );
              }
            }
            return prev;
          });
          // Earliest reliable signal of which file is being written (big writes
          // stream for minutes) — light it up yellow and jump to the code view.
          if (
            event.path &&
            (event.tool === "write_file" || event.tool === "edit_file")
          ) {
            setActivePath(event.path);
            maybeAutoSwitchToCode();
          }
          break;
        }
        case "tool_use": {
          const label = `${event.tool}${event.path ? ` ${event.path}` : ""}`;
          setMessages((prev) => {
            // Finalize the oldest pending row (commits arrive in block order).
            // Without stream events (none pending) append as before.
            const idx = prev.findIndex((m) => m.role === "tool" && m.pending);
            if (idx === -1) {
              return [
                ...prev,
                { id: genId(), role: "tool", content: label, tool: event.tool },
              ];
            }
            return prev.map((m, j) =>
              j === idx
                ? { ...m, content: label, tool: event.tool, pending: false }
                : m,
            );
          });
          break;
        }
        case "file_changed":
          setFiles((prev) => ({ ...prev, [event.path]: event.content }));
          markFileDone(event.path);
          maybeAutoSwitchToCode();
          break;
        case "asset_changed":
          setAssets((prev) => ({ ...prev, [event.path]: event.asset }));
          markFileDone(event.path);
          maybeAutoSwitchToCode();
          break;
        case "file_deleted":
          setFiles((prev) => {
            const next = { ...prev };
            delete next[event.path];
            return next;
          });
          setAssets((prev) => {
            const next = { ...prev };
            delete next[event.path];
            return next;
          });
          setActivePath((cur) => (cur === event.path ? null : cur));
          setDoneTicks((prev) => {
            const next = { ...prev };
            delete next[event.path];
            return next;
          });
          maybeAutoSwitchToCode();
          break;
        case "files":
          setFiles(event.files);
          setAssets(event.assets);
          setInternal(event.internal);
          break;
        case "version":
          setVersions((prev) => [
            {
              id: event.id,
              kind: event.kind,
              label: event.label,
              createdAt: event.createdAt,
            },
            ...prev,
          ]);
          break;
        case "interview":
          // Persist-shaped content (same JSON as the DB row) so the live card
          // and a reloaded card render identically. The server id lets the
          // answer request reference the row.
          appendMessage(
            "assistant",
            JSON.stringify({
              v: 2,
              status: "pending",
              spec: event.spec,
              answers: null,
            } satisfies InterviewState),
            { id: event.id, kind: "interview" },
          );
          break;
        case "attachments_changed":
          refreshAttachments();
          break;
        case "database_changed":
          setHasDatabase(true);
          setDbRefreshKey((k) => k + 1);
          appendMessage(
            "tool",
            event.tables.length > 0
              ? m.workspace.dbUpdated.replace("{tables}", event.tables.join(", "))
              : m.workspace.dbCreated,
            { tool: "database" },
          );
          break;
        case "usage":
          setBalanceEur(event.balanceEur);
          appendMessage(
            "tool",
            `Kosten: ${formatEur(event.billedEur)} · Guthaben: ${formatEur(event.balanceEur)}`,
            { tool: "usage" },
          );
          break;
        case "error":
          setMessages((prev) =>
            prev.map((m) => (m.pending ? { ...m, pending: false } : m)),
          );
          appendMessage("assistant", event.message, { kind: "error" });
          // Stop any lingering yellow highlight; leave the user in the code view
          // so they can see how far the build got.
          setActivePath(null);
          break;
        case "done":
          // A block that streamed but never committed (aborted run) must not
          // keep pulsing forever.
          setMessages((prev) =>
            prev.map((m) => (m.pending ? { ...m, pending: false } : m)),
          );
          setActivePath(null);
          maybeAutoReturnToPreview();
          break;
      }
    },
    [
      appendMessage,
      refreshAttachments,
      m,
      maybeAutoSwitchToCode,
      maybeAutoReturnToPreview,
      markFileDone,
    ],
  );

  // Keep the preview token fresh. The initial token comes from the (cacheable)
  // server render, so it may already be near/after its 1h TTL when a soft
  // navigation restores a stale page from the Router Cache — re-mint on mount
  // and periodically so the iframe always carries a valid token. Skipped without
  // an apps sub-zone (previewUrl undefined → srcDoc fallback, no token).
  useEffect(() => {
    if (!previewUrl) return;
    let cancelled = false;
    const refresh = () => {
      fetch(
        `/api/projects/preview-token?projectId=${encodeURIComponent(projectId)}`,
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { url?: string | null } | null) => {
          if (!cancelled && data && typeof data.url === "string") {
            setPreview(data.url);
          }
        })
        .catch(() => {
          // Non-fatal: keep the current token; the next tick retries.
        });
    };
    refresh();
    const id = setInterval(refresh, 30 * 60 * 1000); // well under the 1h TTL
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, previewUrl]);

  // Hydrate the credit balance on mount (also lazily grants the free tier).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/credit")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { balanceEur?: number } | null) => {
        if (!cancelled && data && typeof data.balanceEur === "number") {
          setBalanceEur(data.balanceEur);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the composer balance in sync when a coupon is redeemed in the account
  // modal (it lives elsewhere in the tree; see lib/credit-events.ts).
  useEffect(() => {
    function onCredit(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.balanceEur === "number") {
        setBalanceEur(detail.balanceEur);
      }
    }
    window.addEventListener(CREDIT_CHANGED_EVENT, onCredit);
    return () => window.removeEventListener(CREDIT_CHANGED_EVENT, onCredit);
  }, []);

  // Returning from a Stripe Payment Link: its success_url lands on
  // /app?checkout=success, but the webhook that grants credit / flips hosting
  // runs asynchronously — so poll /api/credit a few times to reflect the new
  // balance, then strip the query param so a refresh doesn't re-trigger it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    params.delete("checkout");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : ""),
    );

    let cancelled = false;
    let attempts = 0;
    const poll = () => {
      if (cancelled) return;
      attempts += 1;
      fetch("/api/credit")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { balanceEur?: number } | null) => {
          if (cancelled) return;
          if (data && typeof data.balanceEur === "number") {
            setBalanceEur(data.balanceEur);
          }
          if (attempts < 5) setTimeout(poll, 2000);
        })
        .catch(() => {
          if (!cancelled && attempts < 5) setTimeout(poll, 2000);
        });
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: filename,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // rawSiteUrl is the URL the user typed in the export dialog (the box is the
  // source of truth; empty → relative URLs). We remember it and bake it into the
  // exported SEO files in place of the __SITE_URL__ placeholder.
  const onDownload = useCallback(
    async (rawSiteUrl: string) => {
      const html = files["/index.html"];
      if (!html) return;
      const trimmed = rawSiteUrl.trim();
      // Remember the choice (also clears it server-side when emptied).
      void setSiteUrlAction(projectId, trimmed).then((r) => {
        if ("origin" in r) setSiteUrlState(r.origin ?? undefined);
      });

      // A single self-contained /index.html → download it directly (offline).
      // Anything more (extra files or binary assets) → ZIP with exactly those.
      const isSingleFile =
        Object.keys(files).length === 1 && Object.keys(assets).length === 0;
      if (isSingleFile) {
        const origin = normalizeSiteOrigin(trimmed) ?? "";
        saveBlob(
          new Blob([substituteSiteUrl(html, origin)], { type: "text/html" }),
          "index.html",
        );
        return;
      }
      try {
        const qs = new URLSearchParams({ projectId, siteUrl: trimmed });
        const res = await fetch(`/api/projects/export?${qs.toString()}`);
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
        const blob = await res.blob();
        saveBlob(blob, "app.zip");
      } catch {
        appendMessage("assistant", m.workspace.downloadFailed, {
          kind: "error",
        });
      }
    },
    [files, assets, projectId, appendMessage, m],
  );

  const onRestore = useCallback(
    async (backupId: string) => {
      setRestoring(true);
      try {
        const res = await fetch("/api/projects/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, backupId }),
        });
        if (!res.ok) throw new Error(`Restore failed (${res.status})`);
        const data = (await res.json()) as {
          files: Record<string, string>;
          assets: Record<string, AssetMeta>;
          internal: Record<string, string>;
          databaseEnabled: boolean;
        };
        setFiles(data.files);
        setAssets(data.assets);
        setInternal(data.internal);
        // The restored file set is a clean slate — drop any live-build highlights.
        setActivePath(null);
        setDoneTicks({});
        // A full-backup restore can also change the database + attachments, so
        // refresh the Daten/Dateien tabs to reflect the restored state.
        setHasDatabase(data.databaseEnabled);
        setDbRefreshKey((k) => k + 1);
        refreshAttachments();
      } catch {
        appendMessage("assistant", m.workspace.restoreFailed, {
          kind: "error",
        });
      } finally {
        setRestoring(false);
      }
    },
    [projectId, appendMessage, refreshAttachments, m],
  );

  const onPublish = useCallback(async () => {
    setPublishing(true);
    try {
      const result = await publishProjectAction(projectId);
      if ("error" in result) {
        appendMessage("assistant", result.error, { kind: "error" });
      } else {
        setPublishUrl(result.url);
        // Publish froze exactly the current files → now in sync.
        setPublishedSignature(currentSignature);
        if (result.firstPublish) setCelebrating(true);
      }
    } catch {
      appendMessage("assistant", "Publish failed", { kind: "error" });
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
      appendMessage("assistant", "Unpublish failed", { kind: "error" });
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

  // Shared POST-and-stream loop for both /api/agent request variants (chat
  // message and interview answers) — the SSE handling is identical.
  const streamAgentRequest = useCallback(
    async (payload: Record<string, unknown>) => {
      setStreaming(true);
      // Fresh turn: re-arm the auto-view-switch and drop any stale highlight.
      manualViewRef.current = false;
      didAutoSwitchRef.current = false;
      setActivePath(null);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, projectId }),
        });
        if (res.status === 402) {
          const data = (await res.json().catch(() => null)) as {
            balanceEur?: number;
          } | null;
          if (typeof data?.balanceEur === "number") setBalanceEur(data.balanceEur);
          appendMessage("assistant", m.workspace.creditExhausted, {
            kind: "error",
          });
          return;
        }
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
          message: error instanceof Error ? error.message : m.workspace.agentError,
        });
      } finally {
        setStreaming(false);
      }
    },
    [projectId, appendMessage, handleEvent, m],
  );

  const onSend = useCallback(
    async (text: string, attachmentIds: string[] = []) => {
      appendMessage("user", text);
      await streamAgentRequest({ message: text, attachmentIds });
    },
    [appendMessage, streamAgentRequest],
  );

  // Submits the concept-interview card (answers or skip). The card is frozen
  // optimistically — its persisted-shape content flips to answered/skipped —
  // so a double click can't fire twice; the build streams in right after.
  const onInterviewSubmit = useCallback(
    async (messageId: string, submission: InterviewSubmission) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || m.kind !== "interview") return m;
          const state = parseInterviewState(m.content);
          if (!state || state.status !== "pending") return m;
          // Version-aware: v2 answers carry a styleId, legacy v1 a paletteId.
          let next: InterviewState | null = null;
          if ("skip" in submission) {
            next =
              state.v === 1
                ? { ...state, status: "skipped" }
                : { ...state, status: "skipped" };
          } else if (state.v === 1 && "paletteId" in submission) {
            next = { ...state, status: "answered", answers: submission };
          } else if (state.v === 2 && "styleId" in submission) {
            next = { ...state, status: "answered", answers: submission };
          }
          return next ? { ...m, content: JSON.stringify(next) } : m;
        }),
      );
      await streamAgentRequest({
        interview: { messageId, ...submission },
      });
    },
    [streamAgentRequest],
  );

  // Auto-run the landing-page prompt exactly once on first mount of a fresh
  // project, then strip ?run=1 and clear the server cookie so a reload is inert.
  const initialPromptFired = useRef(false);
  useEffect(() => {
    if (initialPromptFired.current) return;
    if (!initialPrompt || messages.length > 0) return;
    initialPromptFired.current = true;
    // Defer past the commit so the send's state updates don't run synchronously
    // inside the effect (and to let the workspace paint first).
    const id = setTimeout(() => {
      onSend(initialPrompt);
      void clearPendingPrompt();
      router.replace(`/app/${projectId}`);
    }, 0);
    return () => clearTimeout(id);
  }, [initialPrompt, messages.length, onSend, projectId, router]);

  return (
    <div className="grid h-full grid-cols-[minmax(300px,380px)_1fr]">
      {celebrating && (
        <ConfettiBurst onDone={() => setCelebrating(false)} />
      )}
      <ChatPanel
        messages={messages}
        streaming={streaming}
        projectId={projectId}
        onSend={onSend}
        onInterviewSubmit={onInterviewSubmit}
        onAttachmentsChanged={refreshAttachments}
        balanceEur={balanceEur}
      />
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <WorkspaceToolbar
          view={effectiveView}
          onViewChange={handleUserViewChange}
          device={device}
          onDeviceChange={setDevice}
          hasDatabase={hasDatabase}
          hasFiles={attachments.length > 0}
          canDownload={!!files["/index.html"]}
          onDownload={onDownload}
          siteUrl={siteUrl}
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
          {effectiveView === "files" ? (
            <AttachmentsView
              attachments={attachments}
              projectId={projectId}
              onDeleted={refreshAttachments}
            />
          ) : effectiveView === "data" ? (
            <DataView projectId={projectId} refreshKey={dbRefreshKey} />
          ) : (
            <SandpackWorkspace
              files={files}
              assets={assets}
              internal={internal}
              view={effectiveView}
              device={device}
              projectId={projectId}
              previewUrl={preview}
              showBadge={showBadge}
              activePath={activePath}
              doneTicks={doneTicks}
            />
          )}
        </div>
      </div>
    </div>
  );
}
