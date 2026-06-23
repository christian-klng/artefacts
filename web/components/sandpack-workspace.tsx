"use client";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackFileExplorer,
  SandpackCodeEditor,
} from "@codesandbox/sandpack-react";
import type { ViewMode } from "./workspace-toolbar";

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
  previewUrl,
}: {
  files: Record<string, string>;
  view: ViewMode;
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
      <iframe
        title="App preview"
        srcDoc={indexHtml}
        // No allow-same-origin: the preview cannot reach our app's origin,
        // cookies, or storage. Scripts/forms run for the demo app.
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
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

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-neutral-500">
      <p>{children}</p>
    </div>
  );
}
