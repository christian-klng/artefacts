"use client";

export type Version = {
  id: string;
  createdAt: string;
  label: string | null;
};

export function WorkspaceToolbar({
  canDownload,
  onDownload,
  versions,
  onRestore,
  busy,
}: {
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
      <span className="text-xs text-neutral-500">
        {total} {total === 1 ? "version" : "versions"}
      </span>
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
