import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = {
  title: "Impressum",
  description: "Impressum von Kubikraum — Anbieterkennzeichnung nach § 5 DDG.",
  alternates: { canonical: "/impressum" },
};

export default function ImpressumPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Impressum</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Gilt für die Website kubikraum.digital sowie den Agenten unter
          app.kubikraum.digital.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Angaben gemäß § 5 DDG
            </h2>
            <p>
              Christian Klang
              <br />
              Köpenicker Landstr. 262
              <br />
              12437 Berlin
              <br />
              Deutschland
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Kontakt
            </h2>
            <p>
              E-Mail:{" "}
              <a
                href="mailto:christian@ kubikraum.digital"
                className="text-info underline underline-offset-2 hover:text-info-deep dark:hover:text-info"
              >
                christian@ kubikraum.digital
              </a>
              <br />
              Telefon: <Placeholder>[Telefonnummer]</Placeholder>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Umsatzsteuer-ID
            </h2>
            <p>
              Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG:{" "}
              DE299488482
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Redaktionell verantwortlich (§ 18 Abs. 2 MStV)
            </h2>
            <p>
              Christian Klang, Anschrift wie oben
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              EU-Streitschlichtung
            </h2>
            <p>
              Die Europäische Kommission stellt eine Plattform zur
              Online-Streitbeilegung (OS) bereit:{" "}
              <a
                href="https://ec.europa.eu/consumers/odr/"
                target="_blank"
                rel="noreferrer"
                className="text-info underline underline-offset-2 hover:text-info-deep dark:hover:text-info"
              >
                https://ec.europa.eu/consumers/odr/
              </a>
              . Unsere E-Mail-Adresse findest du oben.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Verbraucherstreitbeilegung / Universalschlichtungsstelle
            </h2>
            <p>
              Wir sind nicht bereit oder verpflichtet, an
              Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
              teilzunehmen.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Haftung für Inhalte
            </h2>
            <p>
              Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene
              Inhalte auf diesen Seiten nach den allgemeinen Gesetzen
              verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter
              jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
              Informationen zu überwachen oder nach Umständen zu forschen, die
              auf eine rechtswidrige Tätigkeit hinweisen.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Haftung für Links
            </h2>
            <p>
              Unser Angebot enthält ggf. Links zu externen Websites Dritter, auf
              deren Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte
              können wir keine Gewähr übernehmen. Für die Inhalte der verlinkten
              Seiten ist stets der jeweilige Anbieter oder Betreiber
              verantwortlich.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Urheberrecht
            </h2>
            <p>
              Die durch die Seitenbetreiber erstellten Inhalte und Werke auf
              diesen Seiten unterliegen dem deutschen Urheberrecht. Inhalte, die
              Nutzerinnen und Nutzer im Builder selbst erstellen, verbleiben bei
              diesen.
            </p>
          </section>

          <p className="text-xs text-neutral-400">
            Stand: 12.06.2026
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
