"use client";

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
      className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
    >
      <span className="dark:hidden">☾</span>
      <span className="hidden dark:inline">☀</span>
    </button>
  );
}
