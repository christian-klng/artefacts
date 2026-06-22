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
export function SandpackWorkspace({
  files,
  view,
}: {
  files: Record<string, string>;
  view: ViewMode;
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
    return (
      <iframe
        title="App preview"
        srcDoc={indexHtml}
        // No allow-same-origin: the preview cannot reach our app's origin,
        // cookies, or storage. Scripts/forms run for the demo app.
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          background: "white",
        }}
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
