"use client";

import { useActionState } from "react";
import { createCoupon, type CreateState } from "./actions";
import { useMessages } from "@/lib/i18n/provider";

const initialState: CreateState = {};

const field =
  "w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/15";

export function CouponForm() {
  const msgs = useMessages();
  const m = msgs.couponForm;
  const [state, formAction, pending] = useActionState(
    createCoupon,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="code" className="text-sm font-medium">
            {m.codeLabel}{" "}
            <span className="text-foreground/40">{m.codeHint}</span>
          </label>
          <input
            id="code"
            name="code"
            type="text"
            placeholder={m.codePlaceholder}
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="recipient" className="text-sm font-medium">
            {m.recipientLabel}
          </label>
          <input
            id="recipient"
            name="recipient"
            type="text"
            inputMode="decimal"
            placeholder={m.recipientPlaceholder}
            required
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="referrer" className="text-sm font-medium">
            {m.referrerLabel}{" "}
            <span className="text-foreground/40">{msgs.common.optional}</span>
          </label>
          <input
            id="referrer"
            name="referrer"
            type="text"
            inputMode="decimal"
            placeholder={m.referrerPlaceholder}
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="ownerEmail" className="text-sm font-medium">
            {m.ownerEmailLabel}{" "}
            <span className="text-foreground/40">{msgs.common.optional}</span>
          </label>
          <input
            id="ownerEmail"
            name="ownerEmail"
            type="email"
            placeholder={m.ownerEmailPlaceholder}
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="maxRedemptions" className="text-sm font-medium">
            {m.maxLabel}{" "}
            <span className="text-foreground/40">{m.maxHint}</span>
          </label>
          <input
            id="maxRedemptions"
            name="maxRedemptions"
            type="number"
            min="1"
            step="1"
            placeholder="∞"
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="expiresAt" className="text-sm font-medium">
            {m.expiryLabel}{" "}
            <span className="text-foreground/40">{msgs.common.optional}</span>
          </label>
          <input id="expiresAt" name="expiresAt" type="date" className={field} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked
          className="h-4 w-4"
        />
        {m.activeLabel}
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? m.submitting : m.submit}
        </button>
        {state.ok && (
          <span className="text-sm text-green-600 dark:text-green-400">
            {m.createdPrefix}{" "}
            <code className="font-mono">{state.code}</code>
          </span>
        )}
        {state.error && (
          <span className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
