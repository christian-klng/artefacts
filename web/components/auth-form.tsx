"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthState } from "@/app/actions/auth";
import { useMessages } from "@/lib/i18n/provider";

type Mode = "login" | "signup";

// The privacy policy ("Datenschutz") lives on the marketing site, a different
// origin than the builder (app.<domain>) — so this is an absolute URL to that
// domain, the same hardcoded root as the attribution badge (lib/badge.ts).
const PRIVACY_URL = "https://kubikraum.digital/datenschutz";

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
  const msgs = useMessages();
  const t = msgs.auth;
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
          {isSignup ? t.signupTitle : t.loginTitle}
        </h1>
        <p className="text-sm text-neutral-500">
          {isSignup ? t.signupSubtitle : t.loginSubtitle}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {next && <input type="hidden" name="redirectTo" value={next} />}
        {isSignup && (
          <Field label={t.name} name="name" type="text" autoComplete="name" />
        )}
        <Field
          label={t.email}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label={t.password}
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={8}
        />

        {isSignup && (
          <label className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <input
              type="checkbox"
              name="dataConsent"
              required
              className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900 dark:accent-white"
            />
            <span>
              {t.dataConsent.before}
              {/* External (marketing origin); new tab so the half-filled form
                  isn't lost. Nested in the label, but per the HTML spec a click
                  on interactive content doesn't toggle the checkbox. */}
              <a
                href={PRIVACY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {t.dataConsent.link}
              </a>
              {t.dataConsent.after}
            </span>
          </label>
        )}

        {!isSignup && (
          <p className="text-right text-sm">
            <Link
              href="/forgot-password"
              className="text-neutral-500 underline"
            >
              {t.forgotLink}
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
          {pending ? msgs.common.pleaseWait : isSignup ? t.createAccount : t.signIn}
        </button>
      </form>

      <p className="text-center text-sm text-neutral-500">
        {isSignup ? (
          <>
            {t.haveAccount}{" "}
            <Link href={`/login${suffix}`} className="underline">
              {t.signIn}
            </Link>
          </>
        ) : (
          <>
            {t.needAccount}{" "}
            <Link href={`/signup${suffix}`} className="underline">
              {t.signUp}
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
