"use client";

import { useEffect, useState } from "react";
import { logout } from "@/app/actions/auth";

// The right-hand header controls: a user-icon button that opens an account
// details modal, and a power-off button that signs out after a confirmation.
// Both modals share the §7 dropdown/modal surface; the icon buttons match the
// theme toggle so the header reads as one row of consistent controls.

const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white";

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* click-away backdrop */}
      <button
        aria-label="Schließen"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-lg dark:border-neutral-800 dark:bg-neutral-950"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="text-neutral-400 transition hover:text-neutral-900 dark:hover:text-white"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function UserMenu({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  const [details, setDetails] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDetails(true)}
        aria-label="Konto"
        title={email ?? "Konto"}
        className={iconButton}
      >
        <UserIcon />
      </button>

      <button
        type="button"
        onClick={() => setConfirmOut(true)}
        aria-label="Abmelden"
        title="Abmelden"
        className={iconButton}
      >
        <PowerIcon />
      </button>

      {details && (
        <Modal title="Konto" onClose={() => setDetails(false)}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
              <UserIcon />
            </span>
            <div className="min-w-0">
              {name && (
                <p className="truncate text-sm font-medium">{name}</p>
              )}
              <p className="truncate text-sm text-neutral-500">
                {email ?? "—"}
              </p>
            </div>
          </div>
        </Modal>
      )}

      {confirmOut && (
        <Modal title="Abmelden?" onClose={() => setConfirmOut(false)}>
          <p className="text-sm text-neutral-500">
            Möchtest du dich wirklich abmelden?
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOut(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Abbrechen
            </button>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Abmelden
              </button>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
