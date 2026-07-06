"use client";

import { useCallback, useEffect, useState } from "react";
import { useMessages } from "@/lib/i18n/provider";

type TableMeta = { name: string; ownerScoped: boolean };
type Page = {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  primaryKey: string[];
};

// The row being edited: its index on the current page plus the working field
// values. `nulls[col]` tracks whether a field is set to SQL NULL (distinct from
// an empty string).
type EditState = {
  index: number;
  fields: Record<string, string>;
  nulls: Record<string, boolean>;
};

const PAGE_SIZE = 50;

/** Viewer + editor for the project's own database (tables + rows). */
export function DataView({
  projectId,
  refreshKey = 0,
}: {
  projectId: string;
  refreshKey?: number;
}) {
  const m = useMessages();
  const [tables, setTables] = useState<TableMeta[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Row-mutation state.
  const [editing, setEditing] = useState<EditState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // Load the table inventory (and refresh when the schema changes).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/db?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setError(null);
        const list: TableMeta[] = data.tables ?? [];
        setTables(list);
        // Keep the current selection if it still exists, else pick the first.
        setSelected((prev) =>
          prev && list.some((t) => t.name === prev)
            ? prev
            : (list[0]?.name ?? null),
        );
      })
      .catch(() => !cancelled && setError(m.data.errLoadTables));
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey, m]);

  const loadPage = useCallback(
    (table: string, off: number) => {
      const qs = new URLSearchParams({
        projectId,
        table,
        limit: String(PAGE_SIZE),
        offset: String(off),
      });
      // All setState lives in these async callbacks (never synchronously in the
      // caller), so calling loadPage from an effect stays lint-clean.
      fetch(`/api/projects/db?${qs}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
            setPage(null);
          } else {
            setError(null);
            setPage(data as Page);
          }
          // A reload invalidates any in-progress row action.
          setEditing(null);
          setConfirmDelete(null);
          setRowError(null);
        })
        .catch(() => setError(m.data.errLoadData));
    },
    [projectId, m],
  );

  // Load the visible page whenever the table, page, or schema changes. All
  // setState happens inside loadPage's async callback — nothing synchronous in
  // the effect body (which the lint rules forbid).
  useEffect(() => {
    if (selected) loadPage(selected, offset);
  }, [selected, offset, loadPage, refreshKey]);

  function selectTable(name: string) {
    setSelected(name);
    setOffset(0);
  }

  function goto(off: number) {
    setOffset(off);
  }

  // --- Row editing -----------------------------------------------------------
  const canEdit = (page?.primaryKey?.length ?? 0) > 0;

  function startEdit(index: number) {
    if (!page) return;
    const row = page.rows[index];
    const fields: Record<string, string> = {};
    const nulls: Record<string, boolean> = {};
    for (const c of page.columns) {
      fields[c] = cellText(row[c]);
      nulls[c] = row[c] === null || row[c] === undefined;
    }
    setRowError(null);
    setConfirmDelete(null);
    setEditing({ index, fields, nulls });
  }

  function saveEdit() {
    if (!page || !editing || !selected) return;
    const row = page.rows[editing.index];
    const pk: Record<string, unknown> = {};
    for (const c of page.primaryKey) pk[c] = row[c];
    const values: Record<string, unknown> = {};
    for (const c of page.columns) {
      if (page.primaryKey.includes(c)) continue;
      values[c] = editing.nulls[c] ? null : editing.fields[c];
    }
    setBusy(true);
    setRowError(null);
    fetch("/api/projects/db", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, table: selected, pk, values }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        setBusy(false);
        if (!ok) {
          setRowError(body?.error ?? m.data.errSave);
          return;
        }
        setEditing(null);
        loadPage(selected, offset);
      })
      .catch(() => {
        setBusy(false);
        setRowError(m.data.errSave);
      });
  }

  function deleteRow(index: number) {
    if (!page || !selected) return;
    const row = page.rows[index];
    const pk: Record<string, unknown> = {};
    for (const c of page.primaryKey) pk[c] = row[c];
    setBusy(true);
    setRowError(null);
    fetch("/api/projects/db", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, table: selected, pk }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        setBusy(false);
        setConfirmDelete(null);
        if (!ok) {
          setRowError(body?.error ?? m.data.errDelete);
          return;
        }
        loadPage(selected, offset);
      })
      .catch(() => {
        setBusy(false);
        setRowError(m.data.errDelete);
      });
  }

  if (tables === null && !error) {
    return <Centered>{m.data.loadingDb}</Centered>;
  }
  if (tables !== null && tables.length === 0) {
    return <Centered>{m.data.noTables}</Centered>;
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Table list */}
      <aside className="w-48 shrink-0 overflow-y-auto border-r border-neutral-200 p-2 dark:border-neutral-800">
        <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {m.data.tablesHeading}
        </div>
        <ul className="space-y-0.5">
          {tables?.map((t) => (
            <li key={t.name}>
              <button
                type="button"
                onClick={() => selectTable(t.name)}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition ${
                  selected === t.name
                    ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white"
                    : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-900"
                }`}
                title={t.ownerScoped ? m.data.privatePerUser : m.data.sharedData}
              >
                <span className="truncate">{t.name}</span>
                {t.ownerScoped && (
                  <span className="ml-1 shrink-0 text-xs" aria-hidden>
                    🔒
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Rows */}
      <div className="flex min-h-0 flex-1 flex-col">
        {error ? (
          <Centered>
            <span className="text-red-500">{error}</span>
          </Centered>
        ) : page ? (
          <>
            {rowError && (
              <div className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
                {rowError}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                  <tr>
                    {page.columns.map((c) => (
                      <th
                        key={c}
                        className="border-b border-neutral-200 px-3 py-2 font-medium text-neutral-500 dark:border-neutral-800"
                      >
                        {c}
                      </th>
                    ))}
                    {canEdit && (
                      <th className="w-24 border-b border-neutral-200 px-3 py-2 text-right font-medium text-neutral-500 dark:border-neutral-800">
                        {m.data.actions}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="odd:bg-white even:bg-neutral-50/50 dark:odd:bg-transparent dark:even:bg-neutral-900/40"
                    >
                      {page.columns.map((c) => (
                        <td
                          key={c}
                          className="max-w-xs truncate border-b border-neutral-100 px-3 py-1.5 align-top font-mono text-xs dark:border-neutral-800/70"
                          title={cellText(row[c])}
                        >
                          {cellNode(row[c])}
                        </td>
                      ))}
                      {canEdit && (
                        <td className="whitespace-nowrap border-b border-neutral-100 px-3 py-1.5 text-right align-top dark:border-neutral-800/70">
                          {confirmDelete === i ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="mr-1 text-xs text-neutral-500">
                                {m.data.confirmDelete}
                              </span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => deleteRow(i)}
                                className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/40"
                              >
                                {m.data.confirmYes}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmDelete(null)}
                                className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
                              >
                                {m.data.confirmNo}
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <IconButton
                                label={m.data.edit}
                                onClick={() => startEdit(i)}
                                disabled={busy}
                              >
                                {/* pencil */}
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                              </IconButton>
                              <IconButton
                                label={m.data.del}
                                onClick={() => {
                                  setRowError(null);
                                  setConfirmDelete(i);
                                }}
                                disabled={busy}
                                danger
                              >
                                {/* trash */}
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
                                </svg>
                              </IconButton>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {page.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={page.columns.length + (canEdit ? 1 : 0)}
                        className="px-3 py-6 text-center text-neutral-400"
                      >
                        {m.data.noRows}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800">
              <span>
                {page.total === 0
                  ? m.data.zeroRows
                  : m.data.rangeOf
                      .replace("{from}", String(offset + 1))
                      .replace(
                        "{to}",
                        String(Math.min(offset + PAGE_SIZE, page.total)),
                      )
                      .replace("{total}", String(page.total))}
              </span>
              <span className="inline-flex gap-1">
                <PagerButton
                  disabled={offset === 0}
                  onClick={() => goto(Math.max(0, offset - PAGE_SIZE))}
                >
                  {m.data.prev}
                </PagerButton>
                <PagerButton
                  disabled={offset + PAGE_SIZE >= page.total}
                  onClick={() => goto(offset + PAGE_SIZE)}
                >
                  {m.data.next}
                </PagerButton>
              </span>
            </div>
          </>
        ) : (
          <Centered>{m.data.loading}</Centered>
        )}
      </div>

      {/* Edit modal */}
      {editing && page && (
        <EditModal
          columns={page.columns}
          primaryKey={page.primaryKey}
          state={editing}
          busy={busy}
          error={rowError}
          messages={{
            title: m.data.editRow,
            keyBadge: m.data.pkBadge,
            nullLabel: m.data.nullLabel,
            save: m.data.save,
            saving: m.data.saving,
            cancel: m.data.cancel,
          }}
          onChange={(next) => setEditing(next)}
          onCancel={() => {
            setEditing(null);
            setRowError(null);
          }}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}

function EditModal({
  columns,
  primaryKey,
  state,
  busy,
  error,
  messages,
  onChange,
  onCancel,
  onSave,
}: {
  columns: string[];
  primaryKey: string[];
  state: EditState;
  busy: boolean;
  error: string | null;
  messages: {
    title: string;
    keyBadge: string;
    nullLabel: string;
    save: string;
    saving: string;
    cancel: string;
  };
  onChange: (next: EditState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-800">
          {messages.title}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {columns.map((c) => {
            const isPk = primaryKey.includes(c);
            const isNull = state.nulls[c];
            return (
              <div key={c}>
                <div className="mb-1 flex items-center gap-2">
                  <label className="font-mono text-xs text-neutral-500">{c}</label>
                  {isPk && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {messages.keyBadge}
                    </span>
                  )}
                  {!isPk && (
                    <label className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[11px] text-neutral-400">
                      <input
                        type="checkbox"
                        checked={isNull}
                        onChange={(e) =>
                          onChange({
                            ...state,
                            nulls: { ...state.nulls, [c]: e.target.checked },
                          })
                        }
                      />
                      {messages.nullLabel}
                    </label>
                  )}
                </div>
                <textarea
                  value={isNull ? "" : state.fields[c]}
                  readOnly={isPk}
                  disabled={isNull}
                  rows={1}
                  placeholder={isNull ? "NULL" : undefined}
                  onChange={(e) =>
                    onChange({
                      ...state,
                      fields: { ...state.fields, [c]: e.target.value },
                    })
                  }
                  className={`w-full resize-y rounded border px-2 py-1 font-mono text-xs ${
                    isPk
                      ? "border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-800/50"
                      : "border-neutral-300 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                  } ${isNull ? "opacity-50" : ""}`}
                />
              </div>
            );
          })}
        </div>
        {error && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-neutral-200 px-3 py-1.5 text-sm transition hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {messages.cancel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {busy ? messages.saving : messages.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded p-1 transition disabled:opacity-40 ${
        danger
          ? "text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-400">
      {children}
    </div>
  );
}

function PagerButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-neutral-200 px-2 py-1 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}

/** Human-readable text for a cell value (also used as the hover title). */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function cellNode(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-neutral-300 dark:text-neutral-600">—</span>;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
