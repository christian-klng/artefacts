"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthState } from "@/app/actions/auth";

type Mode = "login" | "signup";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: Mode;
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  // Post-auth destination (e.g. "/start" when a prompt is waiting). Threaded
  // through to the server action via a hidden field and preserved in the
  // login↔signup cross-links so a landing-page prompt survives a form switch.
  next?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined,
  );

  const isSignup = mode === "signup";
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="text-sm text-neutral-500">
          {isSignup
            ? "Start building apps from a prompt."
            : "Sign in to your workspace."}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {next && <input type="hidden" name="redirectTo" value={next} />}
        {isSignup && (
          <Field label="Name" name="name" type="text" autoComplete="name" />
        )}
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={8}
        />

        {!isSignup && (
          <p className="text-right text-sm">
            <Link
              href="/forgot-password"
              className="text-neutral-500 underline"
            >
              Forgot password?
            </Link>
          </p>
        )}

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
          {pending
            ? "Please wait…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-neutral-500">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href={`/login${suffix}`} className="underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Need an account?{" "}
            <Link href={`/signup${suffix}`} className="underline">
              Sign up
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...props}
        className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-white"
      />
    </label>
  );
}
