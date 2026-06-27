"use client";

import { useEffect, useState } from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackFileExplorer,
  SandpackCodeEditor,
} from "@codesandbox/sandpack-react";
import type { ViewMode } from "./workspace-toolbar";
import { hasAttachmentRefs } from "@/lib/attachments/ref";

// Renders the project's virtual filesystem either as a live preview (sandboxed
// iframe of the self-contained /index.html) or as a code view (Sandpack file
// tree + read-only editor — both fully offline). We never use SandpackPreview:
// its runtime is CodeSandbox-hosted and fails on a self-hosted deployment.
// Cheap, stable content hash (djb2) so the preview iframe reloads exactly when
// /index.html changes — no effect/state needed.
function hashContent(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function SandpackWorkspace({
  files,
  view,
  projectId,
  previewUrl,
}: {
  files: Record<string, string>;
  view: ViewMode;
  projectId: string;
  // When set, the preview is served from the project's own origin instead of
  // an inline srcDoc (enables real DB/auth). Undefined → srcDoc fallback.
  previewUrl?: string;
}) {
  const indexHtml = files["/index.html"];
  const hasFiles = Object.keys(files).length > 0;

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
        projectId={projectId}
        style={iframeStyle}
      />
    );
  }

  // Code view
  if (!hasFiles) {
    return (
      <EmptyState>
        No files yet — describe an app in the chat to get started.
      </EmptyState>
    );
  }
  return (
    <SandpackProvider
      template="static"
      files={files}
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

// Inline srcDoc preview (no APPS_DOMAIN). When the HTML embeds uploaded files
// (artefact-attachment:<id> refs), we can't expand them client-side — the bytes
// live in the DB — so we fetch the server-rendered, expanded HTML. Without refs
// we use the client's HTML directly (offline, no roundtrip).
function SrcDocPreview({
  indexHtml,
  projectId,
  style,
}: {
  indexHtml: string;
  projectId: string;
  style: React.CSSProperties;
}) {
  const needsExpand = hasAttachmentRefs(indexHtml);
  // Keyed by content hash so a stale render from older HTML is ignored.
  const [rendered, setRendered] = useState<{ key: number; html: string } | null>(
    null,
  );
  const key = hashContent(indexHtml);

  useEffect(() => {
    if (!needsExpand) return;
    let cancelled = false;
    fetch(`/api/projects/render?projectId=${encodeURIComponent(projectId)}`)
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((html) => {
        if (!cancelled) setRendered({ key, html });
      })
      .catch(() => {
        // Fall back to the raw HTML (embedded assets show as broken links).
        if (!cancelled) setRendered({ key, html: indexHtml });
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever the HTML content changes (keyed by its hash).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needsExpand, projectId]);

  // Only use the rendered HTML if it matches the current content.
  const renderedHtml = rendered?.key === key ? rendered.html : null;

  if (needsExpand && renderedHtml === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Vorschau wird vorbereitet…
      </div>
    );
  }

  return (
    <iframe
      title="App preview"
      srcDoc={needsExpand ? (renderedHtml ?? indexHtml) : indexHtml}
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
