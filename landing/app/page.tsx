import Image from "next/image";
import { PromptBox } from "@/components/prompt-box";
import { Features } from "@/components/features";
import { Faq } from "@/components/faq";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

const BUILDER_URL =
  process.env.NEXT_PUBLIC_BUILDER_URL ?? "https://app.kubikraum.digital";

export default async function Home() {
  const locale = await resolveLocale();
  const m = getMessages(locale);
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-neutral-200/70 bg-white/75 px-6 py-4 backdrop-blur-md dark:border-neutral-800/70 dark:bg-neutral-950/75">
        <div className="flex items-center gap-2">
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
        </div>
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

      <main className="mx-auto flex w-full max-w-2xl flex-col justify-center gap-8 px-6 pb-12 pt-16 sm:min-h-[calc(100vh-8rem)] sm:pt-0">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {m.hero.titleLead}
            <span className="underline decoration-warning decoration-4 underline-offset-4">
              {m.hero.titleHighlight}
            </span>
            {m.hero.titleTail}
          </h1>
          <p className="text-lg text-neutral-500">{m.hero.description}</p>
        </div>

        <PromptBox />

        <p className="text-sm text-neutral-500">{m.hero.helper}</p>
      </main>

      <section className="mx-auto w-full max-w-2xl px-6 pb-16">
        <Features items={m.features.items} />
      </section>

      <section className="mx-auto w-full max-w-2xl px-6 pb-24">
        <Faq heading={m.faq.heading} items={m.faq.items} />
      </section>

      <footer className="border-t border-neutral-200 px-6 py-8 dark:border-neutral-800">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-xs text-neutral-500 sm:flex-row sm:justify-between">
          <p>
            © {year} {m.footer.text}
          </p>
          <nav className="flex items-center gap-5">
            <a
              href="mailto:christian@kubikraum.digital"
              className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {m.footer.contact}
            </a>
            <a
              href={`${BUILDER_URL}/login?lang=${locale}`}
              className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {m.nav.login}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
