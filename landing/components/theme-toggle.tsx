"use client";

import { Moon, Sun } from "lucide-react";

// Mirrors the builder's theme toggle: flips the `.dark` class on <html> and
// persists the choice to localStorage (read pre-paint by the script in layout).
// The icon itself is CSS-driven (`dark:` utilities), so no React state is needed.
export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Theme umschalten"
      className="inline-flex items-center justify-center rounded-md border border-neutral-300 px-2.5 py-1.5 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
    >
      <Moon className="h-4 w-4 dark:hidden" aria-hidden />
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
    </button>
  );
}
