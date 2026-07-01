"use client";

import { useCallback, useEffect, useState } from "react";

type TableMeta = { name: string; ownerScoped: boolean };
type Page = { columns: string[]; rows: Record<string, unknown>[]; total: number };

const PAGE_SIZE = 50;

/** Read-only viewer for the project's own database (tables + rows). */
export function DataView({
  projectId,
  refreshKey = 0,
}: {
  projectId: string;
  refreshKey?: number;
}) {
  const [tables, setTables] = useState<TableMeta[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      .catch(() => !cancelled && setError("Tabellen konnten nicht geladen werden."));
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

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
        })
        .catch(() => setError("Daten konnten nicht geladen werden."));
    },
    [projectId],
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

  if (tables === null && !error) {
    return <Centered>Lade Datenbank …</Centered>;
  }
  if (tables !== null && tables.length === 0) {
    return (
      <Centered>
        Diese App hat noch keine Tabellen. Sobald der Agent ein Schema anlegt,
        erscheinen sie hier.
      </Centered>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Table list */}
      <aside className="w-48 shrink-0 overflow-y-auto border-r border-neutral-200 p-2 dark:border-neutral-800">
        <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Tabellen
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
                title={
                  t.ownerScoped
                    ? "Privat pro Nutzer (Row-Level-Security)"
                    : "Geteilte Daten"
                }
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
                    </tr>
                  ))}
                  {page.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={page.columns.length}
                        className="px-3 py-6 text-center text-neutral-400"
                      >
                        Keine Zeilen.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800">
              <span>
                {page.total === 0
                  ? "0 Zeilen"
                  : `${offset + 1}–${Math.min(offset + PAGE_SIZE, page.total)} von ${page.total}`}
              </span>
              <span className="inline-flex gap-1">
                <PagerButton
                  disabled={offset === 0}
                  onClick={() => goto(Math.max(0, offset - PAGE_SIZE))}
                >
                  ← Zurück
                </PagerButton>
                <PagerButton
                  disabled={offset + PAGE_SIZE >= page.total}
                  onClick={() => goto(offset + PAGE_SIZE)}
                >
                  Weiter →
                </PagerButton>
              </span>
            </div>
          </>
        ) : (
          <Centered>Lade …</Centered>
        )}
      </div>
    </div>
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
