"use client";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackFileExplorer,
  SandpackCodeEditor,
  SandpackPreview,
} from "@codesandbox/sandpack-react";

// Renders the project's virtual filesystem as a live workspace: file tree +
// editor + in-browser preview. The agent produces a self-contained
// /index.html, so the "static" bundler template previews it directly with no
// server-side execution.
export function SandpackWorkspace({
  files,
}: {
  files: Record<string, string>;
}) {
  if (!files["/index.html"]) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-neutral-500">
        Your app preview will appear here once the agent creates an
        <code className="mx-1 rounded bg-neutral-100 px-1 dark:bg-neutral-800">
          /index.html
        </code>
        .
      </div>
    );
  }

  return (
    <SandpackProvider
      template="static"
      files={files}
      theme="auto"
      options={{ activeFile: "/index.html" }}
      style={{ height: "100%" }}
    >
      <SandpackLayout style={{ height: "100%", border: "none", borderRadius: 0 }}>
        <SandpackFileExplorer style={{ height: "100%" }} />
        <SandpackCodeEditor showTabs showLineNumbers style={{ height: "100%" }} />
        <SandpackPreview
          showOpenInCodeSandbox={false}
          showRefreshButton
          style={{ height: "100%" }}
        />
      </SandpackLayout>
    </SandpackProvider>
  );
}
