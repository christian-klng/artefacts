import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

const BUILDER_URL =
  process.env.NEXT_PUBLIC_BUILDER_URL ?? "https://app.kubikraum.digital";

// Sticky, blurred site header shared by the home page and the legal pages.
export async function SiteHeader() {
  const locale = await resolveLocale();
  const m = getMessages(locale);

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-neutral-200/70 bg-white/75 px-6 py-4 backdrop-blur-md dark:border-neutral-800/70 dark:bg-neutral-950/75">
      <Link href="/" className="flex items-center gap-2">
        <Image
          src="/brand/logo-on-light.svg"
          alt="Kubikraum"
          width={28}
          height={28}
          className="dark:hidden"
          priority
        />
        <Image
          src="/brand/logo-on-dark.svg"
          alt="Kubikraum"
          width={28}
          height={28}
          className="hidden dark:block"
          priority
        />
        <span className="font-semibold">Kubikraum</span>
      </Link>
      <div className="flex items-center gap-3 text-sm">
        <LocaleToggle />
        <ThemeToggle />
        <a
          href={`${BUILDER_URL}/login?lang=${locale}`}
          className="rounded-md border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          {m.nav.login}
        </a>
      </div>
    </header>
  );
}
