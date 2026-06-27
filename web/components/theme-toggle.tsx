"use client";

// Flips the `.dark` class the pre-paint script in app/layout.tsx manages, and
// persists the choice. The icon is swapped purely via CSS (`dark:` utilities), so
// there's no React state, no effect, and no hydration mismatch.
export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage blocked — the toggle still works for this session.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Theme wechseln"
      title="Theme wechseln"
      className="rounded text-neutral-500 transition hover:text-neutral-900 dark:hover:text-white"
    >
      <span className="inline dark:hidden" aria-hidden>
        ☾
      </span>
      <span className="hidden dark:inline" aria-hidden>
        ☀
      </span>
    </button>
  );
}
