"use client";

export type Version = {
  id: string;
  createdAt: string;
  label: string | null;
};

export type ViewMode = "preview" | "code";

export function WorkspaceToolbar({
  view,
  onViewChange,
  canDownload,
  onDownload,
  versions,
  onRestore,
  busy,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  canDownload: boolean;
  onDownload: () => void;
  versions: Version[];
  onRestore: (versionId: string) => void;
  busy: boolean;
}) {
  // versions are newest-first; number them oldest=1 for a stable label.
  const total = versions.length;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <ViewSwitch view={view} onViewChange={onViewChange} />

      <div className="flex items-center gap-2">
        {total > 0 && (
          <select
            value=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) onRestore(e.target.value);
            }}
            className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none disabled:opacity-50 dark:border-neutral-700"
            aria-label="Restore a previous version"
          >
            <option value="">Restore version…</option>
            {versions.map((v, i) => (
              <option key={v.id} value={v.id}>
                {`v${total - i} · ${new Date(v.createdAt).toLocaleString()}`}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={onDownload}
          disabled={!canDownload}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          Download HTML
        </button>
      </div>
    </div>
  );
}

function ViewSwitch({
  view,
  onViewChange,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}) {
  const base = "rounded px-2.5 py-1 text-xs font-medium transition";
  const activeCls = "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white";
  const inactiveCls = "text-neutral-500 hover:text-neutral-900 dark:hover:text-white";

  return (
    <div className="inline-flex rounded-md bg-neutral-100 p-0.5 dark:bg-neutral-800">
      <button
        type="button"
        onClick={() => onViewChange("preview")}
        className={`${base} ${view === "preview" ? activeCls : inactiveCls}`}
        aria-pressed={view === "preview"}
      >
        Preview
      </button>
      <button
        type="button"
        onClick={() => onViewChange("code")}
        className={`${base} ${view === "code" ? activeCls : inactiveCls}`}
        aria-pressed={view === "code"}
      >
        Code
      </button>
    </div>
  );
}
