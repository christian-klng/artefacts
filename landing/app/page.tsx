import Image from "next/image";
import { PromptBox } from "@/components/prompt-box";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

const BUILDER_URL =
  process.env.NEXT_PUBLIC_BUILDER_URL ?? "https://app.kubikraum.digital";

export default async function Home() {
  const locale = await resolveLocale();
  const m = getMessages(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
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

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
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

      <footer className="px-6 py-6 text-center text-xs text-neutral-500">
        {m.footer.text}
      </footer>
    </div>
  );
}
