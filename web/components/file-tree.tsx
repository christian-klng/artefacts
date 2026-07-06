"use client";

import { useEffect, useMemo } from "react";
import { useSandpack } from "@codesandbox/sandpack-react";
import { File, FileLock2, Folder, Image as ImageIcon } from "lucide-react";
import type { AssetMeta } from "./sandpack-workspace";
import { useMessages } from "@/lib/i18n/provider";

// A custom file tree for the read-only code view — replaces Sandpack's built-in
// <SandpackFileExplorer> (a black box with no per-file styling API) so we can
// light files up as the agent writes them: yellow while a file is being written
// (activePath), a one-shot green flash when its write commits (doneTicks bump).
// Rendered INSIDE <SandpackProvider>, so it can drive the editor via useSandpack.

type Kind = "file" | "asset" | "internal";

type TreeNode = {
  name: string;
  // For files: the full VFS path. For folders: the folder's path (for keys only).
  path: string;
  kind: Kind | "folder";
  children?: TreeNode[];
};

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    const af = a.kind === "folder";
    const bf = b.kind === "folder";
    if (af !== bf) return af ? -1 : 1; // folders first
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) if (n.children) sortNodes(n.children);
}

function buildTree(entries: Array<{ path: string; kind: Kind }>): TreeNode[] {
  const root: TreeNode[] = [];
  for (const { path, kind } of entries) {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let level = root;
    let acc = "";
    parts.forEach((part, i) => {
      acc += `/${part}`;
      const isLeaf = i === parts.length - 1;
      const wantFolder = !isLeaf;
      let node = level.find(
        (n) => n.name === part && (n.kind === "folder") === wantFolder,
      );
      if (!node) {
        node = wantFolder
          ? { name: part, path: acc, kind: "folder", children: [] }
          : { name: part, path, kind };
        level.push(node);
      }
      if (wantFolder) level = node.children!;
    });
  }
  sortNodes(root);
  return root;
}

export function FileTree({
  files,
  assets,
  internal,
  activePath,
  doneTicks,
}: {
  files: Record<string, string>;
  assets: Record<string, AssetMeta>;
  internal: Record<string, string>;
  activePath: string | null;
  doneTicks: Record<string, number>;
}) {
  const m = useMessages();
  const { sandpack } = useSandpack();

  const tree = useMemo(() => {
    const entries: Array<{ path: string; kind: Kind }> = [];
    for (const p of Object.keys(files)) entries.push({ path: p, kind: "file" });
    for (const p of Object.keys(assets))
      entries.push({ path: p, kind: "asset" });
    for (const p of Object.keys(internal))
      entries.push({ path: p, kind: "internal" });
    // A brand-new file the agent just started writing doesn't exist in any map
    // yet — surface it as a pending node so its yellow "editing" phase is visible
    // before the write commits (edits to existing files already have a node).
    if (
      activePath &&
      !(activePath in files) &&
      !(activePath in assets) &&
      !(activePath in internal)
    ) {
      entries.push({ path: activePath, kind: "file" });
    }
    return buildTree(entries);
  }, [files, assets, internal, activePath]);

  // Follow the file the agent is currently editing so the reader watches it fill
  // in. Only open paths Sandpack actually knows about — a phantom pending file
  // isn't in its VFS yet (it opens on its own once the write commits).
  useEffect(() => {
    if (!activePath) return;
    if (activePath in files || activePath in assets || activePath in internal) {
      sandpack.openFile(activePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  return (
    <div className="h-full overflow-auto py-1 font-mono text-xs">
      {tree.map((node) => (
        <TreeRow
          key={`${node.kind}:${node.path}`}
          node={node}
          depth={0}
          activePath={activePath}
          doneTicks={doneTicks}
          selected={sandpack.activeFile}
          onOpen={(p) => sandpack.openFile(p)}
          labels={m.fileTree}
        />
      ))}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  activePath,
  doneTicks,
  selected,
  onOpen,
  labels,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  doneTicks: Record<string, number>;
  selected: string;
  onOpen: (path: string) => void;
  labels: { internal: string; binary: string };
}) {
  const pad = { paddingLeft: depth * 12 + 8 } as const;

  if (node.kind === "folder") {
    return (
      <div>
        <div
          className="flex items-center gap-1.5 py-1 pr-2 text-neutral-500"
          style={pad}
        >
          <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{node.name}</span>
        </div>
        {node.children?.map((c) => (
          <TreeRow
            key={`${c.kind}:${c.path}`}
            node={c}
            depth={depth + 1}
            activePath={activePath}
            doneTicks={doneTicks}
            selected={selected}
            onOpen={onOpen}
            labels={labels}
          />
        ))}
      </div>
    );
  }

  const isActive = node.path === activePath;
  const isSelected = node.path === selected;
  const tick = doneTicks[node.path];
  const Icon =
    node.kind === "asset" ? ImageIcon : node.kind === "internal" ? FileLock2 : File;

  return (
    <button
      type="button"
      onClick={() => onOpen(node.path)}
      title={node.path}
      className={`relative flex w-full items-center gap-1.5 overflow-hidden py-1 pr-2 text-left transition-colors ${
        isActive
          ? "bg-warning/20 text-neutral-900 dark:text-white"
          : isSelected
            ? "bg-neutral-100 dark:bg-neutral-800"
            : "hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50"
      } ${node.kind === "internal" ? "text-neutral-400" : "text-neutral-600 dark:text-neutral-300"}`}
      style={pad}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{node.name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1.5">
        {isActive ? (
          <span
            className="file-editing-dot h-1.5 w-1.5 rounded-full bg-warning"
            aria-hidden
          />
        ) : node.kind === "asset" ? (
          <span className="text-[10px] text-neutral-400">{labels.binary}</span>
        ) : node.kind === "internal" ? (
          <span className="text-[10px] text-neutral-400">{labels.internal}</span>
        ) : null}
      </span>
      {/* Green "done" wash — remounts (key) on each completion so the one-shot
          CSS animation replays. Absent until the file has committed at least once
          this session, so existing files never flash on initial load. */}
      {tick != null && (
        <span
          key={tick}
          aria-hidden
          className="file-flash-done pointer-events-none absolute inset-0"
        />
      )}
    </button>
  );
}
