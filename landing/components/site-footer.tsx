import Link from "next/link";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

// Subtle site footer shared by the home page and the legal pages.
export async function SiteFooter() {
  const locale = await resolveLocale();
  const m = getMessages(locale);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-200 px-6 py-8 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-xs text-neutral-500 sm:flex-row sm:justify-between">
        <p>
          © {year} {m.footer.text}
        </p>
        <nav className="flex items-center gap-5">
          <Link
            href="/impressum"
            className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {m.footer.imprint}
          </Link>
          <Link
            href="/datenschutz"
            className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {m.footer.privacy}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
