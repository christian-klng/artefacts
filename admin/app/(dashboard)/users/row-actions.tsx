"use client";

import { useState, useTransition } from "react";
import { setAdmin } from "./actions";
import { useMessages } from "@/lib/i18n/provider";

/**
 * Admin-flag toggle for one user. Optimistic: flips immediately and reverts if
 * the server write fails. Mirrors the apps "Leuchtturm" FeaturedToggle.
 */
export function AdminToggle({
  userId,
  isAdmin,
}: {
  userId: string;
  isAdmin: boolean;
}) {
  const m = useMessages().users;
  const [on, setOn] = useState(isAdmin);
  const [pending, start] = useTransition();

  const onChange = (next: boolean) => {
    setOn(next);
    start(async () => {
      const res = await setAdmin(userId, next);
      if (res.error) setOn(!next); // revert
    });
  };

  return (
    <label
      className="inline-flex cursor-pointer items-center gap-2"
      title={m.adminHint}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-amber-500 disabled:opacity-50"
      />
    </label>
  );
}
