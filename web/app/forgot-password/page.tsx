"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthState } from "@/app/actions/auth";
import { useMessages } from "@/lib/i18n/provider";

export default function ForgotPasswordPage() {
  const msgs = useMessages();
  const t = msgs.auth;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    undefined,
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t.forgotTitle}
        </h1>
        <p className="text-sm text-neutral-500">{t.forgotSubtitle}</p>
      </div>

      {state?.success ? (
        <p
          className="rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          role="status"
        >
          {t.forgotSuccess}
        </p>
      ) : (
        <form action={formAction} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t.email}</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-white"
            />
          </label>

          {state?.error && (
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {pending ? msgs.common.pleaseWait : t.sendResetLink}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-neutral-500">
        <Link href="/login" className="underline">
          {t.backToSignIn}
        </Link>
      </p>
    </div>
  );
}
