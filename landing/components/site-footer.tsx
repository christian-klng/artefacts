import Link from "next/link";
import { EuFlag, DeFlag } from "@/components/flags";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

// Subtle site footer shared by the home page and the legal pages.
export async function SiteFooter() {
  const locale = await resolveLocale();
  const m = getMessages(locale);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-200 px-6 py-8 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-xs text-neutral-500 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: trust badges, stacked */}
        <div className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex h-4 w-6 shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/10 dark:ring-white/20">
              <EuFlag className="h-full w-full" />
            </span>
            {m.footer.badgeEu}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex h-4 w-[27px] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/10 dark:ring-white/20">
              <DeFlag className="h-full w-full" />
            </span>
            {m.footer.badgeDe}
          </span>
        </div>

        {/* Right: slogan + legal menu */}
        <div className="flex flex-col gap-3 sm:items-end sm:text-right">
          <p>
            © {year} {m.footer.text}
          </p>
          <nav className="flex items-center gap-5">
            <Link
              href="/agb"
              className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {m.footer.terms}
            </Link>
            <Link
              href="/datenschutz"
              className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {m.footer.privacy}
            </Link>
            <Link
              href="/impressum"
              className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {m.footer.imprint}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
