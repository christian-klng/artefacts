"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import {
  createProjectAction,
  renameProjectAction,
  deleteProjectAction,
} from "@/app/actions/projects";
import { useMessages } from "@/lib/i18n/provider";

type Project = { id: string; name: string };

export function ProjectSwitcher({ projects }: { projects: Project[] }) {
  const m = useMessages();
  const pathname = usePathname();
  const activeId = pathname?.split("/")[2]; // /app/<id>
  const active = projects.find((p) => p.id === activeId);

  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);

  function close() {
    setOpen(false);
    setRenaming(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        <span className="max-w-[200px] truncate">
          {active?.name ?? m.projectSwitcher.projects}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <button
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
            <ul className="max-h-64 overflow-y-auto">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/app/${p.id}`}
                    onClick={close}
                    className={`block truncate rounded px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                      p.id === activeId ? "font-medium" : ""
                    }`}
                  >
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-1 border-t border-neutral-200 pt-1 dark:border-neutral-800">
              <form action={createProjectAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                  {m.projectSwitcher.newProject}
                </button>
              </form>

              {active &&
                (renaming ? (
                  <form
                    action={async (formData) => {
                      await renameProjectAction(formData);
                      close();
                    }}
                    className="flex items-center gap-1 px-1 py-1"
                  >
                    <input type="hidden" name="projectId" value={active.id} />
                    <input
                      name="name"
                      defaultValue={active.name}
                      autoFocus
                      className="min-w-0 flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm outline-none dark:border-neutral-700"
                    />
                    <button
                      type="submit"
                      className="rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-white dark:text-neutral-900"
                    >
                      {m.common.save}
                    </button>
                  </form>
                ) : (
                  <div className="flex">
                    <button
                      onClick={() => setRenaming(true)}
                      className="flex-1 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {m.projectSwitcher.rename}
                    </button>
                    <form
                      action={deleteProjectAction}
                      onSubmit={(e) => {
                        if (
                          !confirm(
                            m.projectSwitcher.deleteConfirm.replace(
                              "{name}",
                              active.name,
                            ),
                          )
                        )
                          e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="projectId" value={active.id} />
                      <button
                        type="submit"
                        className="rounded px-2 py-1.5 text-sm text-danger hover:bg-danger/10"
                      >
                        {m.projectSwitcher.delete}
                      </button>
                    </form>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
