"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export type Version = {
  id: string;
  createdAt: string;
  label: string | null;
};

export type ViewMode = "preview" | "code" | "files";

export function WorkspaceToolbar({
  view,
  onViewChange,
  canDownload,
  onDownload,
  siteUrl,
  versions,
  onRestore,
  busy,
  publishEnabled,
  canPublish,
  publishing,
  publishUrl,
  publishDirty,
  onPublish,
  onUnpublish,
  onSetSlug,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  canDownload: boolean;
  onDownload: (rawSiteUrl: string) => void | Promise<void>;
  siteUrl?: string;
  versions: Version[];
  onRestore: (versionId: string) => void;
  busy: boolean;
  publishEnabled: boolean;
  canPublish: boolean;
  publishing: boolean;
  publishUrl?: string;
  publishDirty: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onSetSlug: (desired: string) => Promise<string | undefined>;
}) {
  // versions are newest-first; number them oldest=1 for a stable label.
  const total = versions.length;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <ViewSwitch view={view} onViewChange={onViewChange} />

      <div className="flex items-center gap-2">
        {/* Preview tab: publishing. Code tab: version history + download. */}
        {view === "preview" && publishEnabled && (
          <PublishControls
            canPublish={canPublish}
            publishing={publishing}
            publishUrl={publishUrl}
            publishDirty={publishDirty}
            onPublish={onPublish}
            onUnpublish={onUnpublish}
            onSetSlug={onSetSlug}
          />
        )}
        {view === "code" && (
          <>
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
            <ExportControls
              canDownload={canDownload}
              siteUrl={siteUrl}
              onDownload={onDownload}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ExportControls({
  canDownload,
  siteUrl,
  onDownload,
}: {
  canDownload: boolean;
  siteUrl?: string;
  onDownload: (rawSiteUrl: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(siteUrl ?? "");
  const [busy, setBusy] = useState(false);

  // Close on Escape while the popover is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const run = async () => {
    setBusy(true);
    try {
      await onDownload(value);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  // The button stays the only thing in the toolbar row; the panel is absolutely
  // positioned beneath it (out of flow) so the row never changes height.
  return (
    <div className="relative">
      <button
        onClick={() => {
          setValue(siteUrl ?? "");
          setOpen((o) => !o);
        }}
        disabled={!canDownload}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        Download
      </button>

      {open && (
        <>
          {/* click-away catcher */}
          <button
            aria-label="Schließen"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Export"
            className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-neutral-200 bg-white p-3 text-left shadow-lg dark:border-neutral-800 dark:bg-neutral-950"
          >
            <p className="mb-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              Ziel-URL der Veröffentlichung — wird in SEO-Angaben (Canonical,
              Open Graph, Sitemap) eingesetzt. Leer lassen für relative Pfade.
            </p>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
              }}
              disabled={busy}
              spellCheck={false}
              placeholder="https://meine-domain.de"
              className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-900 disabled:opacity-50 dark:border-neutral-600 dark:focus:border-white"
              aria-label="Veröffentlichungs-URL"
            />
            <div className="mt-2.5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
              >
                Abbrechen
              </button>
              <button
                onClick={run}
                disabled={busy}
                className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
              >
                {busy ? "…" : "Herunterladen"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PublishControls({
  canPublish,
  publishing,
  publishUrl,
  publishDirty,
  onPublish,
  onUnpublish,
  onSetSlug,
}: {
  canPublish: boolean;
  publishing: boolean;
  publishUrl?: string;
  publishDirty: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onSetSlug: (desired: string) => Promise<string | undefined>;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  const copy = async () => {
    if (!publishUrl) return;
    try {
      await navigator.clipboard.writeText(publishUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — no-op; the link is visible.
    }
  };

  if (!publishUrl) {
    return (
      <button
        onClick={onPublish}
        disabled={!canPublish || publishing}
        className="rounded-md border border-success px-3 py-1 text-xs font-medium text-success hover:bg-success/10 disabled:opacity-50"
        title={canPublish ? "App öffentlich veröffentlichen" : "Noch keine /index.html"}
      >
        {publishing ? "Veröffentlichen…" : "Veröffentlichen"}
      </button>
    );
  }

  // Split host into the editable slug (label) and the fixed ".apps.<domain>".
  const host = publishUrl.replace(/^https?:\/\//, "");
  const dot = host.indexOf(".");
  const slug = host.slice(0, dot);
  const domainSuffix = host.slice(dot); // includes leading dot

  if (editing) {
    return (
      <SlugEditor
        initialSlug={slug}
        domainSuffix={domainSuffix}
        onSetSlug={onSetSlug}
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700">
      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
      <a
        href={publishUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="max-w-[180px] truncate text-xs text-success hover:underline"
        title={publishUrl}
      >
        {host}
      </a>
      <button
        onClick={() => setEditing(true)}
        className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
        title="Adresse ändern"
      >
        Adresse
      </button>
      <button
        onClick={copy}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
        title="Link kopieren"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" aria-hidden /> Kopiert
          </>
        ) : (
          "Kopieren"
        )}
      </button>
      {publishDirty ? (
        <button
          onClick={onPublish}
          disabled={publishing}
          className="rounded px-1.5 py-0.5 text-xs font-medium text-success hover:opacity-80 disabled:opacity-50"
          title="Es gibt Änderungen seit der Veröffentlichung — neu veröffentlichen"
        >
          {publishing ? "…" : "Aktualisieren"}
        </button>
      ) : (
        <span
          className="px-1.5 py-0.5 text-xs text-neutral-400"
          title="Der veröffentlichte Stand entspricht dem aktuellen Code"
        >
          Aktueller Stand
        </span>
      )}
      <button
        onClick={onUnpublish}
        disabled={publishing}
        className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:text-danger disabled:opacity-50"
        title="Offline nehmen"
      >
        Offline
      </button>
    </div>
  );
}

function SlugEditor({
  initialSlug,
  domainSuffix,
  onSetSlug,
  onClose,
}: {
  initialSlug: string;
  domainSuffix: string;
  onSetSlug: (desired: string) => Promise<string | undefined>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialSlug);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = value.trim();
    if (trimmed === initialSlug) return onClose();
    setSaving(true);
    setError(undefined);
    const err = await onSetSlug(trimmed);
    setSaving(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onClose();
        }}
        disabled={saving}
        spellCheck={false}
        className="w-32 rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 text-xs outline-none focus:border-success disabled:opacity-50 dark:border-neutral-600"
        aria-label="Öffentliche Adresse"
      />
      <span className="text-xs text-neutral-400" title={domainSuffix}>
        {domainSuffix}
      </span>
      <button
        onClick={save}
        disabled={saving}
        className="rounded bg-success px-2 py-0.5 text-xs font-medium text-info-deep disabled:opacity-50"
      >
        {saving ? "…" : "Speichern"}
      </button>
      <button
        onClick={onClose}
        disabled={saving}
        className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
      >
        Abbrechen
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
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
      <button
        type="button"
        onClick={() => onViewChange("files")}
        className={`${base} ${view === "files" ? activeCls : inactiveCls}`}
        aria-pressed={view === "files"}
      >
        Dateien
      </button>
    </div>
  );
}
