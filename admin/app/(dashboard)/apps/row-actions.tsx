"use client";

import { useState, useTransition } from "react";
import { setPublished, toggleFeatured } from "./actions";
import { useMessages } from "@/lib/i18n/provider";

/**
 * Publish / take-offline button for one app. Publishing is outward-facing (the
 * app goes public or dark), so it confirms first, then calls the server action
 * which delegates to the builder's internal publish endpoint.
 */
export function PublishButton({
  projectId,
  published,
}: {
  projectId: string;
  published: boolean;
}) {
  const m = useMessages().apps;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    const confirmMsg = published ? m.confirmUnpublish : m.confirmPublish;
    if (!window.confirm(confirmMsg)) return;
    start(async () => {
      const res = await setPublished(projectId, !published);
      if (res.error) setError(res.error);
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={
          published
            ? "rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5 disabled:opacity-50 dark:border-white/15"
            : "rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        }
      >
        {pending ? m.working : published ? m.unpublish : m.publish}
      </button>
      {error && (
        <span className="max-w-[16rem] text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * "Leuchtturm" (landing-page showcase) toggle for one app. Optimistic: flips the
 * checkbox immediately and reverts if the server write fails.
 */
export function FeaturedToggle({
  projectId,
  featured,
}: {
  projectId: string;
  featured: boolean;
}) {
  const m = useMessages().apps;
  const [on, setOn] = useState(featured);
  const [pending, start] = useTransition();

  const onChange = (next: boolean) => {
    setOn(next);
    start(async () => {
      const res = await toggleFeatured(projectId, next);
      if (res.error) setOn(!next); // revert
    });
  };

  return (
    <label
      className="inline-flex cursor-pointer items-center gap-2"
      title={m.featuredHint}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-amber-500 disabled:opacity-50"
      />
      {on && <span aria-hidden>🗼</span>}
    </label>
  );
}
