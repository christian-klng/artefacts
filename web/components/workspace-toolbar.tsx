"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CloudOff,
  Copy,
  Monitor,
  Pencil,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useMessages } from "@/lib/i18n/provider";

export type Version = {
  id: string;
  createdAt: string;
  label: string | null;
  // Backup kind: 'auto' | 'daily' | 'publish' | 'manual' (see lib/backup.ts).
  kind: string;
};

export type ViewMode = "preview" | "code" | "files" | "data";

// Preview viewport size, for testing an app's responsiveness (see DeviceStage in
// sandpack-workspace.tsx). "desktop" = full bleed; tablet/mobile constrain width.
export type DeviceMode = "desktop" | "tablet" | "mobile";

export function WorkspaceToolbar({
  view,
  onViewChange,
  device,
  onDeviceChange,
  hasDatabase,
  hasFiles,
  canDownload,
  editMode,
  canEdit,
  onToggleEdit,
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
  readOnly = false,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  device: DeviceMode;
  onDeviceChange: (device: DeviceMode) => void;
  hasDatabase: boolean;
  hasFiles: boolean;
  canDownload: boolean;
  /** Inline text-edit mode is on (preview only). */
  editMode: boolean;
  /** Whether the inline-edit toggle is offered (has /index.html, not read-only). */
  canEdit: boolean;
  onToggleEdit: () => void;
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
  /** Admin read-only view — hides publish/restore/download (the write actions). */
  readOnly?: boolean;
}) {
  const m = useMessages();
  // versions are newest-first; number them oldest=1 for a stable label.
  const total = versions.length;
  const backupLabel: Record<string, string> = {
    auto: m.toolbar.backupAuto,
    daily: m.toolbar.backupDaily,
    publish: m.toolbar.backupPublish,
    manual: m.toolbar.backupManual,
  };

  return (
    <div className="relative flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <ViewSwitch
        view={view}
        onViewChange={onViewChange}
        hasDatabase={hasDatabase}
        hasFiles={hasFiles}
      />

      {/* Device switcher — absolutely centered so it stays mid-toolbar
          regardless of the side controls' widths. Only meaningful with a live
          preview, so gate on the preview tab + an existing /index.html. */}
      {view === "preview" && canDownload && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <DeviceSwitch device={device} onDeviceChange={onDeviceChange} />
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Preview tab: inline text editing + publishing. Code tab: history. */}
        {view === "preview" && canEdit && (
          <button
            type="button"
            onClick={onToggleEdit}
            aria-pressed={editMode}
            title={m.toolbar.editTextHint}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition ${
              editMode
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            }`}
          >
            <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {editMode ? m.toolbar.editTextActive : m.toolbar.editText}
          </button>
        )}
        {view === "preview" && publishEnabled && !readOnly && (
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
        {view === "code" && !readOnly && (
          <>
            {total > 0 && (
              <select
                value=""
                disabled={busy}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  // A full-backup restore overwrites live DB + accounts too, so
                  // confirm before replacing everything.
                  if (confirm(m.toolbar.restoreConfirm)) {
                    onRestore(id);
                  }
                }}
                className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none disabled:opacity-50 dark:border-neutral-700"
                aria-label={m.toolbar.restoreAria}
              >
                <option value="">{m.toolbar.restorePlaceholder}</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {`${backupLabel[v.kind] ?? v.kind} · ${new Date(
                      v.createdAt,
                    ).toLocaleString()}`}
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
  const m = useMessages();
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
        {m.toolbar.download}
      </button>

      {open && (
        <>
          {/* click-away catcher */}
          <button
            aria-label={m.common.close}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label={m.toolbar.exportAria}
            className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-neutral-200 bg-white p-3 text-left shadow-lg dark:border-neutral-800 dark:bg-neutral-950"
          >
            <p className="mb-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {m.toolbar.downloadHint}
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
              placeholder={m.toolbar.downloadUrlPlaceholder}
              className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-900 disabled:opacity-50 dark:border-neutral-600 dark:focus:border-white"
              aria-label={m.toolbar.downloadUrlAria}
            />
            <div className="mt-2.5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
              >
                {m.common.cancel}
              </button>
              <button
                onClick={run}
                disabled={busy}
                className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
              >
                {busy ? "…" : m.toolbar.downloadBtn}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Menu row inside the publish panel — full-width action with a leading icon.
const publishMenuRow =
  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs " +
  "enabled:hover:bg-neutral-100 disabled:opacity-50 dark:enabled:hover:bg-neutral-800";

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
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  const published = !!publishUrl;

  // Close on Escape while the panel is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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

  // Split host into the editable slug (label) and the fixed ".apps.<domain>".
  const host = publishUrl ? publishUrl.replace(/^https?:\/\//, "") : "";
  const dot = host.indexOf(".");
  const slug = dot === -1 ? host : host.slice(0, dot);
  const domainSuffix = dot === -1 ? "" : host.slice(dot); // includes leading dot

  const statusText = publishDirty
    ? m.toolbar.dirtyStatus
    : m.toolbar.cleanStatus;

  // Like the download button: the panel is absolutely positioned beneath the
  // button (out of flow) so the toolbar row never changes height.
  return (
    <div className="relative">
      <button
        onClick={() => {
          setEditing(false);
          setCopied(false);
          setOpen((o) => !o);
        }}
        disabled={!published && !canPublish}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={
          published
            ? statusText
            : canPublish
              ? m.toolbar.publishTitlePublic
              : m.toolbar.publishTitleNoIndex
        }
        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50 ${
          published
            ? "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            : "border-success text-success hover:bg-success/10"
        }`}
      >
        {published && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${publishDirty ? "bg-warning" : "bg-success"}`}
            aria-hidden
          />
        )}
        {published
          ? m.toolbar.published
          : publishing
            ? m.toolbar.publishing
            : m.toolbar.publish}
      </button>

      {open && (
        <>
          {/* click-away catcher */}
          <button
            aria-label={m.common.close}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label={m.toolbar.publishDialogAria}
            className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-neutral-200 bg-white p-3 text-left shadow-lg dark:border-neutral-800 dark:bg-neutral-950"
          >
            {!published ? (
              <>
                <p className="mb-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {m.toolbar.publishIntro}
                </p>
                <button
                  onClick={onPublish}
                  disabled={!canPublish || publishing}
                  className="w-full rounded bg-success px-3 py-1.5 text-xs font-medium text-info-deep hover:opacity-90 disabled:opacity-50"
                >
                  {publishing ? m.toolbar.publishRunning : m.toolbar.publish}
                </button>
              </>
            ) : editing ? (
              <SlugEditor
                initialSlug={slug}
                domainSuffix={domainSuffix}
                onSetSlug={onSetSlug}
                onClose={() => setEditing(false)}
              />
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${publishDirty ? "bg-warning" : "bg-success"}`}
                    aria-hidden
                  />
                  <a
                    href={publishUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-xs font-medium text-success hover:underline"
                    title={publishUrl}
                  >
                    {host}
                  </a>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {statusText}
                </p>
                <div className="mt-2 space-y-0.5 border-t border-neutral-200 pt-2 dark:border-neutral-800">
                  <button
                    onClick={onPublish}
                    disabled={!publishDirty || publishing}
                    title={
                      publishDirty
                        ? m.toolbar.updateTitleDirty
                        : m.toolbar.updateTitleClean
                    }
                    className={`${publishMenuRow} ${
                      publishDirty ? "font-medium text-success" : ""
                    }`}
                  >
                    <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {publishing ? m.toolbar.updating : m.toolbar.update}
                  </button>
                  <button onClick={copy} className={publishMenuRow}>
                    {copied ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-success"
                        aria-hidden
                      />
                    ) : (
                      <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    {copied ? m.toolbar.linkCopied : m.toolbar.copyLink}
                  </button>
                  <button
                    onClick={() => setEditing(true)}
                    className={publishMenuRow}
                  >
                    <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {m.toolbar.changeAddress}
                  </button>
                  <button
                    onClick={onUnpublish}
                    disabled={publishing}
                    title={m.toolbar.takeOfflineTitle}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-danger enabled:hover:bg-danger/10 disabled:opacity-50"
                  >
                    <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {m.toolbar.takeOffline}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
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
  const m = useMessages();
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
    <>
      <p className="mb-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        {m.toolbar.slugHint}
      </p>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            // Leave the editor but keep the publish panel open.
            e.stopPropagation();
            onClose();
          }
        }}
        disabled={saving}
        spellCheck={false}
        className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-900 disabled:opacity-50 dark:border-neutral-600 dark:focus:border-white"
        aria-label={m.toolbar.slugAria}
      />
      <p
        className="mt-1.5 truncate text-xs text-neutral-400"
        title={`${value.trim() || initialSlug}${domainSuffix}`}
      >
        {value.trim() || initialSlug}
        {domainSuffix}
      </p>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      <div className="mt-2.5 flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
        >
          {m.common.cancel}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-success px-3 py-1 text-xs font-medium text-info-deep hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "…" : m.common.save}
        </button>
      </div>
    </>
  );
}

// Desktop / Tablet / Mobile toggle for the preview viewport. Purely a preview
// affordance — it resizes the iframe (DeviceStage) so the user can eyeball the
// app's responsiveness without leaving the builder.
function DeviceSwitch({
  device,
  onDeviceChange,
}: {
  device: DeviceMode;
  onDeviceChange: (device: DeviceMode) => void;
}) {
  const m = useMessages();
  const options: Array<{
    key: DeviceMode;
    Icon: typeof Monitor;
    label: string;
  }> = [
    { key: "desktop", Icon: Monitor, label: m.toolbar.deviceDesktop },
    { key: "tablet", Icon: Tablet, label: m.toolbar.deviceTablet },
    { key: "mobile", Icon: Smartphone, label: m.toolbar.deviceMobile },
  ];
  return (
    <div className="pointer-events-auto inline-flex rounded-md bg-neutral-100 p-0.5 dark:bg-neutral-800">
      {options.map(({ key, Icon, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onDeviceChange(key)}
          className={`rounded p-1.5 transition ${
            device === key
              ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          }`}
          aria-pressed={device === key}
          aria-label={label}
          title={label}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}

function ViewSwitch({
  view,
  onViewChange,
  hasDatabase,
  hasFiles,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  hasDatabase: boolean;
  hasFiles: boolean;
}) {
  const m = useMessages();
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
        {m.toolbar.preview}
      </button>
      <button
        type="button"
        onClick={() => onViewChange("code")}
        className={`${base} ${view === "code" ? activeCls : inactiveCls}`}
        aria-pressed={view === "code"}
      >
        {m.toolbar.code}
      </button>
      {hasFiles && (
        <button
          type="button"
          onClick={() => onViewChange("files")}
          className={`${base} ${view === "files" ? activeCls : inactiveCls}`}
          aria-pressed={view === "files"}
        >
          {m.toolbar.files}
        </button>
      )}
      {hasDatabase && (
        <button
          type="button"
          onClick={() => onViewChange("data")}
          className={`${base} ${view === "data" ? activeCls : inactiveCls}`}
          aria-pressed={view === "data"}
        >
          {m.toolbar.data}
        </button>
      )}
    </div>
  );
}
