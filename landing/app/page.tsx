import { PromptBox } from "@/components/prompt-box";
import { Features } from "@/components/features";
import { Faq } from "@/components/faq";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

export default async function Home() {
  const locale = await resolveLocale();
  const m = getMessages(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

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
      </main>

      <section className="mx-auto w-full max-w-2xl px-6 pb-16">
        <Features items={m.features.items} />
      </section>

      <section className="mx-auto w-full max-w-2xl px-6 pb-24">
        <Faq heading={m.faq.heading} items={m.faq.items} />
      </section>

      <SiteFooter />
    </div>
  );
}
