"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  useSandpack,
} from "@codesandbox/sandpack-react";
import type { EditorView } from "@codemirror/view";
import type { DeviceMode, ViewMode } from "./workspace-toolbar";
import { FileTree } from "./file-tree";
import {
  flashExtension,
  flashEditRange,
  type EditHighlight,
} from "./editor-flash";
import { injectBadge } from "@/lib/badge";
import { useMessages } from "@/lib/i18n/provider";

export type AssetMeta = { mimeType: string | null; size: number; hash: string };

// CSS pixel dimensions per preview device. `desktop` is full-bleed (no frame);
// tablet/mobile constrain the iframe to a realistic viewport so the app's own
// responsive CSS kicks in. Width is what drives media queries — height only caps
// the framed device so it never overflows the stage.
const DEVICE_SIZES: Record<
  Exclude<DeviceMode, "desktop">,
  { width: number; height: number }
> = {
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

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
  device = "desktop",
  projectId,
  previewUrl,
  showBadge = true,
  activePath = null,
  doneTicks = {},
  highlight = null,
}: {
  files: Record<string, string>;
  assets: Record<string, AssetMeta>;
  // Agent-memory files (/CONCEPT.md, /DESIGN.md): merged into the read-only code
  // tree only — deliberately NOT into `indexHtml`/`multiFile`/preview below, so
  // the user can read them without them counting toward the shipped app.
  internal?: Record<string, string>;
  view: ViewMode;
  // Preview viewport size (device switcher in the toolbar). Only affects the
  // preview branch below; ignored by the code view.
  device?: DeviceMode;
  projectId: string;
  // Live-build highlights for the code tree: the file currently being written
  // (yellow) and a per-path completion counter (green flash). See file-tree.tsx.
  activePath?: string | null;
  doneTicks?: Record<string, number>;
  // A just-changed spot to scroll to and flash yellow in the code editor. Bumps
  // its `nonce` each edit so a repeated change to the same range re-fires.
  highlight?: EditHighlight | null;
  // When set, the preview is served from the project's own origin instead of
  // an inline srcDoc (enables real DB/auth). Undefined → srcDoc fallback.
  previewUrl?: string;
  // "Erstellt mit Kubikraum" badge. With previewUrl the serve/render routes
  // inject it server-side; this flag only drives the single-file srcDoc path
  // below, which never hits the server.
  showBadge?: boolean;
}) {
  const m = useMessages();
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
    // A single DeviceStage wraps BOTH preview paths. `device` only toggles the
    // stage's classes/size — the iframe element and its src stay identical, so
    // switching device resizes the app in place without reloading it (no lost
    // scroll/auth/state); the `previewUrl` branch is stable across device changes.
    return (
      <DeviceStage device={device}>
        {previewUrl ? (
          <iframe
            title={m.sandpack.appPreview}
            src={`${previewUrl}${previewUrl.includes("?") ? "&" : "?"}v=${hashContent(indexHtml)}`}
            // The app runs on its own origin (a different origin than the builder),
            // so allow-same-origin is safe here — it cannot reach the builder —
            // and is needed for the app's own cookies/storage/auth later.
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock allow-same-origin"
            style={iframeStyle}
          />
        ) : (
          <SrcDocPreview
            indexHtml={indexHtml}
            multiFile={multiFile}
            projectId={projectId}
            showBadge={showBadge}
            style={iframeStyle}
          />
        )}
      </DeviceStage>
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
        <div className="h-full w-56 shrink-0 overflow-hidden border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <FileTree
            files={files}
            assets={assets}
            internal={internal}
            activePath={activePath}
            doneTicks={doneTicks}
          />
        </div>
        <CodeArea
          files={files}
          assets={assets}
          projectId={projectId}
          highlight={highlight}
        />
      </SandpackLayout>
    </SandpackProvider>
  );
}

function isRasterImageAsset(path: string, meta?: AssetMeta): boolean {
  if (meta?.mimeType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(path);
}

// The editor pane. Sandpack's read-only code editor can't render images, so we
// swap in a real <img> (bytes fetched on demand from the owner-scoped
// /api/projects/asset route) for image content — that's how the user sees the
// auto-generated OG thumbnail, embedded logos and stock photos. Two cases:
//   - binary raster images live in `assets` (base64) and carry a content hash;
//   - SVGs are stored as TEXT (in `files`), so we render them from their content
//     (the route serves them as image/svg+xml; <img src> never runs SVG scripts).
// Text files and non-image binaries (PDF/fonts) keep the code editor (which shows
// the binary placeholder text for the latter). Must live inside SandpackProvider
// for useSandpack/SandpackCodeEditor to work.
function CodeArea({
  files,
  assets,
  projectId,
  highlight,
}: {
  files: Record<string, string>;
  assets: Record<string, AssetMeta>;
  projectId: string;
  highlight: EditHighlight | null;
}) {
  const { sandpack } = useSandpack();
  const active = sandpack.activeFile;
  const meta = assets[active];
  if (meta && isRasterImageAsset(active, meta)) {
    return (
      <AssetImageView
        projectId={projectId}
        path={active}
        version={meta.hash}
        mimeType={meta.mimeType ?? "image"}
        size={meta.size}
      />
    );
  }
  const svg = files[active];
  if (svg !== undefined && /\.svg$/i.test(active)) {
    return (
      <AssetImageView
        projectId={projectId}
        path={active}
        // No stored hash for text files — a cheap content hash busts the cache
        // when the SVG changes.
        version={String(hashContent(svg))}
        mimeType="image/svg+xml"
        size={new TextEncoder().encode(svg).length}
      />
    );
  }
  if (meta && isFontAsset(active, meta)) {
    return (
      <FontSpecimenView
        projectId={projectId}
        path={active}
        version={meta.hash}
        mimeType={meta.mimeType ?? "font"}
        size={meta.size}
      />
    );
  }
  return <CodeEditorPane highlight={highlight} />;
}

// Minimal shape of SandpackCodeEditor's ref (its CodeEditorRef/CodeMirrorRef is
// not re-exported from the package root). Structurally identical, so it types
// the ref without reaching into the package's dist path.
type SandpackEditorHandle = { getCodemirror: () => EditorView | undefined };

// The read-only code editor, plus the "scroll to the edited spot + flash it
// yellow" behavior. Split out from CodeArea so its hooks never sit behind the
// early image/font returns above. Streaming NOT via the files prop: a files-prop
// change resets Sandpack (active file snaps back to /index.html, scroll lost),
// so we drive the CodeMirror EditorView directly (ref + `extensions`).
function CodeEditorPane({ highlight }: { highlight: EditHighlight | null }) {
  const { sandpack } = useSandpack();
  const active = sandpack.activeFile;
  const code = sandpack.files[active]?.code ?? "";
  const editorRef = useRef<SandpackEditorHandle>(null);
  const pendingRef = useRef<EditHighlight | null>(null);
  const cancelRef = useRef<() => void>(() => {});

  // A new highlight arrived: remember it and switch to its file if needed. The
  // actual flash waits for that file's content to land in the editor (below),
  // because openFile + Sandpack's own doc update happen across a re-render.
  useEffect(() => {
    if (!highlight) return;
    pendingRef.current = highlight;
    if (highlight.path !== sandpack.activeFile) sandpack.openFile(highlight.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight?.nonce]);

  // Once the target file is active AND its post-edit content is in the editor
  // (guarded by doc length), scroll to the change and flash it. Sandpack's inner
  // CodeMirror is a child, so its doc-replace effect runs before this parent
  // effect — the content is ready here.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || active !== pending.path) return;
    const view = editorRef.current?.getCodemirror();
    if (!view || view.state.doc.length < pending.to) return;
    pendingRef.current = null;
    cancelRef.current();
    cancelRef.current = flashEditRange(view, pending);
  }, [active, code]);

  // Clear a pending flash-clear timer on unmount.
  useEffect(() => () => cancelRef.current(), []);

  return (
    <SandpackCodeEditor
      ref={editorRef}
      readOnly
      showTabs={false}
      showLineNumbers
      extensions={flashExtension}
      style={{ height: "100%", flex: 1 }}
    />
  );
}

function isFontAsset(path: string, meta?: AssetMeta): boolean {
  if (meta?.mimeType && /^font\//i.test(meta.mimeType)) return true;
  return /\.(woff2?|ttf|otf)$/i.test(path);
}

function assetUrl(projectId: string, path: string, version: string): string {
  return (
    `/api/projects/asset?projectId=${encodeURIComponent(projectId)}` +
    `&path=${encodeURIComponent(path)}&v=${encodeURIComponent(version)}`
  );
}

// A small light/dark checkerboard so transparent images (logos) read clearly.
const CHECKERBOARD =
  "repeating-conic-gradient(rgba(0,0,0,0.06) 0% 25%, transparent 0% 50%) 50% / 20px 20px";

function AssetImageView({
  projectId,
  path,
  version,
  mimeType,
  size,
}: {
  projectId: string;
  path: string;
  version: string;
  mimeType: string;
  size: number;
}) {
  const name = path.split("/").pop() ?? path;
  return (
    <div className="flex h-full flex-1 flex-col bg-neutral-50 dark:bg-neutral-950">
      <div
        className="flex flex-1 items-center justify-center overflow-auto p-6"
        style={{ background: CHECKERBOARD }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl(projectId, path, version)}
          alt={name}
          className="max-h-full max-w-full rounded border border-neutral-200 object-contain shadow-sm dark:border-neutral-800"
        />
      </div>
      <div className="shrink-0 border-t border-neutral-200 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        {name} · {mimeType} · {formatSize(size)}
      </div>
    </div>
  );
}

// Sample text for the font preview. A German pangram (the builder's audience) +
// the Latin alphabet, digits and punctuation, rendered in the actual VFS font.
const FONT_PANGRAM =
  "Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich.";

// A read-only viewer can't "show" a font file, so we register it as an @font-face
// (loaded from the same owner-scoped asset route) and render a specimen in it —
// that's how the user sees what an embedded/added webfont actually looks like.
function FontSpecimenView({
  projectId,
  path,
  version,
  mimeType,
  size,
}: {
  projectId: string;
  path: string;
  version: string;
  mimeType: string;
  size: number;
}) {
  const name = path.split("/").pop() ?? path;
  const src = assetUrl(projectId, path, version);
  // Unique + stable per file version, so a changed font re-registers cleanly.
  const family = `vfsfont-${version.replace(/[^a-z0-9]/gi, "")}`;
  const format = /\.woff2$/i.test(path)
    ? "woff2"
    : /\.woff$/i.test(path)
      ? "woff"
      : /\.ttf$/i.test(path)
        ? "truetype"
        : /\.otf$/i.test(path)
          ? "opentype"
          : null;
  const css =
    `@font-face{font-family:'${family}';` +
    `src:url('${src}')${format ? ` format('${format}')` : ""};font-display:swap;}`;
  const fontFamily = `'${family}', system-ui, sans-serif`;
  return (
    <div className="flex h-full flex-1 flex-col overflow-auto bg-white dark:bg-neutral-950">
      <style>{css}</style>
      <div className="flex-1 space-y-5 p-8" style={{ fontFamily }}>
        <p className="text-4xl leading-tight text-neutral-900 dark:text-neutral-100">
          {FONT_PANGRAM}
        </p>
        <p className="break-all text-2xl text-neutral-800 dark:text-neutral-200">
          ABCDEFGHIJKLMNOPQRSTUVWXYZ
        </p>
        <p className="break-all text-2xl text-neutral-800 dark:text-neutral-200">
          abcdefghijklmnopqrstuvwxyz
        </p>
        <p className="break-all text-xl text-neutral-700 dark:text-neutral-300">
          0123456789 &amp; .,:;!?&ldquo;&rdquo;()[]{"{}"}#$%@*/—
        </p>
        <div className="space-y-1 pt-2">
          {[14, 18, 24, 32].map((px) => (
            <p
              key={px}
              style={{ fontSize: px }}
              className="text-neutral-700 dark:text-neutral-300"
            >
              {px}px — The quick brown fox jumps over the lazy dog.
            </p>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-neutral-200 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        {name} · {mimeType} · {formatSize(size)}
      </div>
    </div>
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
  const m = useMessages();
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
      title={m.sandpack.appPreview}
      srcDoc={showBadge ? injectBadge(src) : src}
      // No allow-same-origin: the preview cannot reach our app's origin,
      // cookies, or storage. Scripts/forms run for the demo app.
      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
      style={style}
    />
  );
}

// Centers + frames the preview iframe at a chosen device size. Structure is
// CONSTANT across devices (stage > frame > children) — only classes/inline size
// change — so the iframe never remounts (and the app never reloads) on a switch.
function DeviceStage({
  device,
  children,
}: {
  device: DeviceMode;
  children: React.ReactNode;
}) {
  const framed = device !== "desktop";
  const size = framed ? DEVICE_SIZES[device] : null;
  return (
    <div
      className={
        framed
          ? "flex h-full w-full items-center justify-center overflow-auto bg-neutral-100 p-4 dark:bg-neutral-950"
          : "h-full w-full"
      }
    >
      <div
        className={
          framed
            ? "overflow-hidden rounded-2xl border border-neutral-300 bg-white shadow-xl dark:border-neutral-700"
            : "h-full w-full"
        }
        style={
          size
            ? {
                width: size.width,
                height: size.height,
                maxWidth: "100%",
                maxHeight: "100%",
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-neutral-500">
      <p>{children}</p>
    </div>
  );
}
