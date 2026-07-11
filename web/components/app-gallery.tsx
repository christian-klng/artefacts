"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Check, Globe, ImageOff, Plus, User } from "lucide-react";
import { useMessages } from "@/lib/i18n/provider";
import { createProjectAction } from "@/app/actions/projects";

// One card in the "Meine Apps" grid. The server builds `thumbnailUrl` (the
// owner/admin-gated asset route with a hash `?v=` buster) so this component stays
// dumb; timestamps arrive as epoch ms purely for client-side sorting.
export type GalleryCard = {
  id: string;
  name: string;
  slug: string | null;
  updatedAt: number;
  createdAt: number;
  thumbnailUrl: string | null;
  // Only populated in the admin (all-apps) view.
  ownerEmail: string | null;
};

type SortKey = "recent" | "name" | "created";

export function AppGallery({
  projects,
  isAdmin,
}: {
  projects: GalleryCard[];
  isAdmin: boolean;
}) {
  const m = useMessages();
  const [sort, setSort] = useState<SortKey>("recent");
  const [sortOpen, setSortOpen] = useState(false);

  // Client-side sort — the whole list is already loaded, so reordering is instant.
  const sorted = useMemo(() => {
    const copy = [...projects];
    if (sort === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "created") copy.sort((a, b) => b.createdAt - a.createdAt);
    else copy.sort((a, b) => b.updatedAt - a.updatedAt);
    return copy;
  }, [projects, sort]);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "recent", label: m.gallery.sortRecent },
    { key: "name", label: m.gallery.sortName },
    { key: "created", label: m.gallery.sortCreated },
  ];

  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-y-auto px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          {isAdmin ? m.gallery.adminAll : m.gallery.title}
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setSortOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              <ArrowUpDown
                className="h-4 w-4 shrink-0 text-neutral-400"
                aria-hidden
              />
              {m.gallery.sort}
            </button>
            {sortOpen && (
              <>
                <button
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setSortOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setSort(opt.key);
                        setSortOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {opt.label}
                      {sort === opt.key && (
                        <Check className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <form action={createProjectAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              {m.gallery.newApp}
            </button>
          </form>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-500">{m.gallery.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p) => (
            <Link
              key={p.id}
              href={`/app/${p.id}`}
              className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-300 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
            >
              <div className="aspect-[1200/630] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                {p.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover object-top transition duration-200 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-neutral-300 dark:text-neutral-700">
                    <ImageOff className="h-8 w-8" aria-hidden />
                  </div>
                )}
              </div>
              <div className="space-y-1 p-3">
                <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {p.name}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {p.slug ?? m.gallery.notPublished}
                  </span>
                </div>
                {isAdmin && p.ownerEmail && (
                  <div
                    className="flex items-center gap-1.5 text-xs text-neutral-400"
                    title={`${m.gallery.owner}: ${p.ownerEmail}`}
                  >
                    <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{p.ownerEmail}</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
