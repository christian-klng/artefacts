"use client";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackFileExplorer,
  SandpackCodeEditor,
} from "@codesandbox/sandpack-react";

// Renders the project's virtual filesystem as a workspace: file tree + code
// viewer (both from Sandpack, fully offline) + a live preview.
//
// We deliberately do NOT use SandpackPreview: it connects to CodeSandbox's
// hosted runtime, which fails on a self-hosted deployment (TIME_OUT). The agent
// produces a self-contained /index.html, so we preview it directly in a
// sandboxed iframe — no external dependency, no bundler.
export function SandpackWorkspace({
  files,
}: {
  files: Record<string, string>;
}) {
  const indexHtml = files["/index.html"];

  if (!indexHtml) {
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
        <HtmlPreview html={indexHtml} />
      </SandpackLayout>
    </SandpackProvider>
  );
}

function HtmlPreview({ html }: { html: string }) {
  return (
    <div
      style={{ flex: 1, minWidth: 0, height: "100%" }}
      className="border-l border-neutral-200 bg-white dark:border-neutral-800"
    >
      <iframe
        title="App preview"
        srcDoc={html}
        // No allow-same-origin: the preview cannot reach our app's origin,
        // cookies, or storage. Scripts/forms run for the demo app.
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
        style={{ width: "100%", height: "100%", border: "none" }}
      />
    </div>
  );
}
