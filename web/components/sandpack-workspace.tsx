"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackFileExplorer,
  SandpackCodeEditor,
} from "@codesandbox/sandpack-react";
import type { ViewMode } from "./workspace-toolbar";
import { injectBadge } from "@/lib/badge";

export type AssetMeta = { mimeType: string | null; size: number; hash: string };

// Renders the project's virtual filesystem either as a live preview (sandboxed
// iframe) or as a code view (Sandpack file tree + read-only editor). We never use
// SandpackPreview: its runtime is CodeSandbox-hosted and fails self-hosted.
// Cheap, stable content hash (djb2) so the preview iframe reloads exactly when
// /index.html changes — no effect/state needed.
function hashContent(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SandpackWorkspace({
  files,
  assets,
  internal = {},
  view,
  projectId,
  previewUrl,
  showBadge = true,
}: {
  files: Record<string, string>;
  assets: Record<string, AssetMeta>;
  // Agent-memory files (/CONCEPT.md, /DESIGN.md): merged into the read-only code
  // tree only — deliberately NOT into `indexHtml`/`multiFile`/preview below, so
  // the user can read them without them counting toward the shipped app.
  internal?: Record<string, string>;
  view: ViewMode;
  projectId: string;
  // When set, the preview is served from the project's own origin instead of
  // an inline srcDoc (enables real DB/auth). Undefined → srcDoc fallback.
  previewUrl?: string;
  // "Erstellt mit Kubikraum" badge. With previewUrl the serve/render routes
  // inject it server-side; this flag only drives the single-file srcDoc path
  // below, which never hits the server.
  showBadge?: boolean;
}) {
  const indexHtml = files["/index.html"];
  // The project is multi-file when it has more than just /index.html or any
  // binary asset — then the srcDoc fallback must inline assets server-side.
  const multiFile =
    Object.keys(files).length > 1 || Object.keys(assets).length > 0;

  // Binary assets shown as placeholder entries so they appear in the file tree
  // (the editor is read-only and can't render images); real bytes ship via the
  // serve/export routes, never to the client.
  const sandpackFiles = useMemo(() => {
    const map: Record<string, string> = { ...files };
    for (const [path, meta] of Object.entries(assets)) {
      map[path] =
        `Binäre Datei: ${path.split("/").pop()} ` +
        `(${meta.mimeType ?? "unbekannt"}, ${formatSize(meta.size)}).\n` +
        `Im Download/ZIP und auf der veröffentlichten Seite enthalten.`;
    }
    // Agent-memory files last: readable in the tree, but internal — the agent's
    // concept/design notes, not part of the exported or published app.
    for (const [path, content] of Object.entries(internal)) {
      map[path] = content;
    }
    return map;
  }, [files, assets, internal]);

  if (view === "preview") {
    if (!indexHtml) {
      return (
        <EmptyState>
          Your app preview will appear here once the agent creates an{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
            /index.html
          </code>
          .
        </EmptyState>
      );
    }
    const iframeStyle = {
      width: "100%",
      height: "100%",
      border: "none",
      background: "white",
    } as const;
    if (previewUrl) {
      const sep = previewUrl.includes("?") ? "&" : "?";
      return (
        <iframe
          title="App preview"
          src={`${previewUrl}${sep}v=${hashContent(indexHtml)}`}
          // The app runs on its own origin (a different origin than the builder),
          // so allow-same-origin is safe here — it cannot reach the builder —
          // and is needed for the app's own cookies/storage/auth later.
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock allow-same-origin"
          style={iframeStyle}
        />
      );
    }
    return (
      <SrcDocPreview
        indexHtml={indexHtml}
        multiFile={multiFile}
        projectId={projectId}
        showBadge={showBadge}
        style={iframeStyle}
      />
    );
  }

  // Code view
  if (Object.keys(sandpackFiles).length === 0) {
    return (
      <EmptyState>
        No files yet — describe an app in the chat to get started.
      </EmptyState>
    );
  }
  return (
    <SandpackProvider
      template="static"
      files={sandpackFiles}
      theme="auto"
      options={indexHtml ? { activeFile: "/index.html" } : undefined}
      style={{ height: "100%" }}
    >
      <SandpackLayout
        style={{ height: "100%", border: "none", borderRadius: 0 }}
      >
        <SandpackFileExplorer style={{ height: "100%" }} />
        <SandpackCodeEditor
          readOnly
          showTabs
          showLineNumbers
          style={{ height: "100%" }}
        />
      </SandpackLayout>
    </SandpackProvider>
  );
}

// Inline srcDoc preview (no APPS_DOMAIN). A multi-file app references other VFS
// files by relative path, which don't resolve in a srcDoc iframe — so we fetch
// the server-rendered HTML with those assets inlined as data URIs. A single
// self-contained /index.html is shown directly (offline, no roundtrip).
function SrcDocPreview({
  indexHtml,
  multiFile,
  projectId,
  showBadge,
  style,
}: {
  indexHtml: string;
  multiFile: boolean;
  projectId: string;
  showBadge: boolean;
  style: React.CSSProperties;
}) {
  // Keyed by content hash so a stale render from older HTML is ignored.
  const [rendered, setRendered] = useState<{ key: number; html: string } | null>(
    null,
  );
  const key = hashContent(indexHtml);

  useEffect(() => {
    if (!multiFile) return;
    let cancelled = false;
    fetch(`/api/projects/render?projectId=${encodeURIComponent(projectId)}`)
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((html) => {
        if (!cancelled) setRendered({ key, html });
      })
      .catch(() => {
        // Fall back to the raw HTML (relative assets show as broken links).
        if (!cancelled) setRendered({ key, html: indexHtml });
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever the HTML content changes (keyed by its hash).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, multiFile, projectId]);

  const renderedHtml = rendered?.key === key ? rendered.html : null;

  if (multiFile && renderedHtml === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Vorschau wird vorbereitet…
      </div>
    );
  }

  // multiFile HTML comes from /api/projects/render, which already injected the
  // badge — injectBadge is idempotent, so wrapping is a no-op there and only
  // adds it to the single-file / render-failure path.
  const src = multiFile ? (renderedHtml ?? indexHtml) : indexHtml;
  return (
    <iframe
      title="App preview"
      srcDoc={showBadge ? injectBadge(src) : src}
      // No allow-same-origin: the preview cannot reach our app's origin,
      // cookies, or storage. Scripts/forms run for the demo app.
      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
      style={style}
    />
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-neutral-500">
      <p>{children}</p>
    </div>
  );
}
