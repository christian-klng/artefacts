"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

export type AttachmentMeta = {
  id: string;
  filename: string;
  mimeType: string;
  kind: "text" | "image";
  size: number;
  createdAt: string;
  preview?: string | null;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The "Dateien" tab: the user's uploaded reference files for this project. These
 * are separate from the app's code (different table), so they never show up in
 * the Sandpack file tree. Download fetches the original; delete removes it.
 */
export function AttachmentsView({
  attachments,
  projectId,
  onDeleted,
}: {
  attachments: AttachmentMeta[];
  projectId: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  // Which file is awaiting delete confirmation (inline, no native dialog).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const remove = async (id: string) => {
    setConfirmingId(null);
    setDeleting(id);
    try {
      const res = await fetch(
        `/api/attachments/${id}?projectId=${encodeURIComponent(projectId)}`,
        { method: "DELETE" },
      );
      if (res.ok) onDeleted();
    } finally {
      setDeleting(null);
    }
  };

  if (attachments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-neutral-500">
        <p>
          Noch keine Dateien. Lade im Chat Design-Konzepte, Texte oder
          Vorlagen (PDF, DOCX, TXT, MD, HTML/CSS, Bilder …) hoch — der Agent
          nutzt sie als Referenz.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <ul className="space-y-2">
        {attachments.map((a) => {
          const src = `/api/attachments/${a.id}?projectId=${encodeURIComponent(projectId)}`;
          return (
            <li
              key={a.id}
              className="flex gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={a.filename}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <FileText className="h-6 w-6" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium" title={a.filename}>
                    {a.filename}
                  </p>
                  <span className="shrink-0 text-xs text-neutral-400">
                    {formatSize(a.size)}
                  </span>
                </div>
                <p className="text-xs text-neutral-500">
                  {a.kind === "image" ? "Bild" : "Text"} ·{" "}
                  {new Date(a.createdAt).toLocaleString()}
                </p>
                {a.preview ? (
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                    {a.preview}
                  </p>
                ) : null}
                <div className="mt-2 flex gap-3 text-xs">
                  <a
                    href={src}
                    className="text-neutral-600 hover:text-neutral-900 hover:underline dark:text-neutral-300 dark:hover:text-white"
                  >
                    Download
                  </a>
                  {confirmingId === a.id ? (
                    <span className="flex items-center gap-2">
                      <span className="text-neutral-500">Wirklich löschen?</span>
                      <button
                        onClick={() => remove(a.id)}
                        className="font-medium text-danger hover:underline"
                      >
                        Ja
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                      >
                        Abbrechen
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(a.id)}
                      disabled={deleting === a.id}
                      className="text-neutral-500 hover:text-danger disabled:opacity-50"
                    >
                      {deleting === a.id ? "Löschen…" : "Löschen"}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
