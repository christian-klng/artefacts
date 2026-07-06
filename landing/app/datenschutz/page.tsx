import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = {
  title: "Datenschutz",
  description:
    "Datenschutzerklärung von Kubikraum für Website und Builder (DSGVO).",
  alternates: { canonical: "/datenschutz" },
};

// NOTE: Startgerüst aus den bekannten technischen Verarbeitungen + Platzhaltern
// (gelb markiert). Bitte durch Datenschutz-Fachkundige prüfen/ergänzen lassen —
// dies ist keine Rechtsberatung.
export default function DatenschutzPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          Datenschutzerklärung
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Gilt für die Website kubikraum.digital sowie den Builder unter
          app.kubikraum.digital.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              1. Verantwortlicher
            </h2>
            <p>
              Verantwortlich für die Datenverarbeitung auf dieser Website und im
              Builder ist:
              <br />
              Christian Klang, <Placeholder>[Anschrift]</Placeholder>, E-Mail:{" "}
              <a
                href="mailto:christian@kubikraum.digital"
                className="text-info underline underline-offset-2 hover:text-info-deep dark:hover:text-info"
              >
                christian@kubikraum.digital
              </a>
              , Telefon: <Placeholder>[Telefonnummer]</Placeholder>.
            </p>
            <p>
              Datenschutzbeauftragte/r:{" "}
              <Placeholder>
                [falls bestellt, hier angeben — für viele kleine Anbieter nicht
                erforderlich]
              </Placeholder>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              2. Grundsätzliches
            </h2>
            <p>
              Wir verarbeiten personenbezogene Daten ausschließlich im Rahmen der
              Datenschutz-Grundverordnung (DSGVO) und des
              Bundesdatenschutzgesetzes (BDSG). Nachfolgend informieren wir über
              Art, Umfang und Zweck der Verarbeitung sowie über deine Rechte.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              3. Hosting
            </h2>
            <p>
              Website und Builder werden self-hosted auf Servern in Deutschland
              betrieben. Hosting-Anbieter / Rechenzentrum:{" "}
              <Placeholder>[Anbieter, Anschrift, Serverstandort]</Placeholder>.
              Mit dem Anbieter besteht ein Vertrag zur Auftragsverarbeitung (AVV)
              nach Art. 28 DSGVO. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO
              (berechtigtes Interesse an einem sicheren, effizienten Betrieb).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              4. Server-Logfiles
            </h2>
            <p>
              Beim Aufruf erheben wir automatisch Zugriffsdaten (u. a.
              IP-Adresse, Datum und Uhrzeit, aufgerufene Ressource, übertragene
              Datenmenge, Browsertyp und Betriebssystem, Referrer) in
              Server-Logfiles. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.
              Speicherdauer: <Placeholder>[z. B. 7–14 Tage]</Placeholder>,
              anschließend Löschung oder Anonymisierung.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              5. Cookies und lokale Speicherung
            </h2>
            <p>
              Website: Wir setzen ein technisch notwendiges, funktionales Cookie
              zur Speicherung der gewählten Sprache sowie lokalen Speicher
              (localStorage) für die Theme-Einstellung (hell/dunkel). Builder:
              Zur Anmeldung und Sitzungsverwaltung setzen wir technisch
              notwendige Cookies (Session/Authentifizierung). Rechtsgrundlage:
              § 25 Abs. 2 TDDDG sowie Art. 6 Abs. 1 lit. f DSGVO. Tracking- oder
              Marketing-Cookies setzen wir nicht.{" "}
              <Placeholder>[prüfen/ergänzen]</Placeholder>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              6. Registrierung und Nutzerkonto (Builder)
            </h2>
            <p>
              Für die Nutzung des Builders ist ein Konto erforderlich. Wir
              verarbeiten deine E-Mail-Adresse und dein Passwort (letzteres wird
              ausschließlich als sicherer Hash gespeichert, nie im Klartext). Die
              Daten werden in einer PostgreSQL-Datenbank in Deutschland
              gespeichert. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
              (Vertragserfüllung).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              7. Von dir erstellte Inhalte (Projekte, Apps, Daten)
            </h2>
            <p>
              Im Builder erstellte Projekte, Dateien und – sofern du für deine App
              eine Datenbank aktivierst – deren Inhalte speichern wir, um den
              Dienst bereitzustellen, eine Vorschau zu erzeugen und die
              Veröffentlichung zu ermöglichen. Rechtsgrundlage: Art. 6 Abs. 1
              lit. b DSGVO.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              8. Verarbeitung durch Künstliche Intelligenz (App-Generierung)
            </h2>
            <p>
              Zur Generierung deiner Apps werden deine Eingaben (Prompts) und der
              zugehörige Projektkontext an unseren KI-Dienstleister übermittelt
              und dort verarbeitet: cortecs.ai (
              <Placeholder>
                [Anbieter/Firmierung, Anschrift, Serverstandort]
              </Placeholder>
              ) als Auftragsverarbeiter nach Art. 28 DSGVO. Rechtsgrundlage:
              Art. 6 Abs. 1 lit. b DSGVO.{" "}
              <Placeholder>
                [AVV-Status, Serverstandort, Sub-Auftragsverarbeiter und ob eine
                Drittlandübermittlung nach Art. 44 ff. DSGVO stattfindet, bitte
                ergänzen]
              </Placeholder>
              . Nach unserem Kenntnisstand werden deine Inhalte nicht zum Training
              von KI-Modellen verwendet –{" "}
              <Placeholder>
                [bitte anhand des Vertrags/DPA des Anbieters bestätigen]
              </Placeholder>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              9. Zahlungsabwicklung (Stripe)
            </h2>
            <p>
              Für Zahlungen (Abo, Guthaben-Aufladung) nutzen wir Stripe (Stripe
              Payments Europe, Ltd., <Placeholder>[Anschrift]</Placeholder>). Bei
              einer Zahlung werden die zur Abwicklung erforderlichen Daten an
              Stripe übermittelt und dort verarbeitet. Rechtsgrundlage: Art. 6
              Abs. 1 lit. b und lit. f DSGVO. Es gelten ergänzend die
              Datenschutzhinweise von Stripe:{" "}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-info underline underline-offset-2 hover:text-info-deep dark:hover:text-info"
              >
                https://stripe.com/privacy
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              10. E-Mail-Versand und Kontakt
            </h2>
            <p>
              Für Transaktions- und System-E-Mails setzen wir einen
              E-Mail-Dienstleister (SMTP) ein:{" "}
              <Placeholder>[Anbieter, Anschrift]</Placeholder>. Wenn du uns per
              E-Mail kontaktierst, verarbeiten wir deine Angaben zur Bearbeitung
              der Anfrage. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und lit. f DSGVO.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              11. Empfänger / eingesetzte Auftragsverarbeiter
            </h2>
            <p>
              Zusammenfassung der eingesetzten Dienstleister: Hosting (
              <Placeholder>[Anbieter]</Placeholder>), KI-Generierung
              (cortecs.ai), Zahlungsabwicklung (Stripe), E-Mail-Versand (
              <Placeholder>[SMTP-Anbieter]</Placeholder>). Weitere Empfänger nur,
              soweit gesetzlich vorgeschrieben.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              12. Speicherdauer
            </h2>
            <p>
              Wir speichern personenbezogene Daten nur so lange, wie es für die
              genannten Zwecke erforderlich ist oder gesetzliche
              Aufbewahrungsfristen bestehen. Konto- und Projektdaten werden nach
              Löschung des Kontos entfernt.{" "}
              <Placeholder>[konkrete Fristen ergänzen]</Placeholder>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              13. Deine Rechte
            </h2>
            <p>
              Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16),
              Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
              Datenübertragbarkeit (Art. 20) sowie Widerspruch (Art. 21 DSGVO).
              Zudem besteht ein Beschwerderecht bei einer Aufsichtsbehörde
              (Art. 77 DSGVO). Für uns zuständige Aufsichtsbehörde:{" "}
              <Placeholder>[Landesdatenschutzbehörde des Bundeslandes]</Placeholder>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              14. Änderungen dieser Datenschutzerklärung
            </h2>
            <p>
              Wir passen diese Erklärung an, wenn sich die Rechtslage oder unsere
              Verarbeitung ändert.
            </p>
            <p className="text-xs text-neutral-400">
              Stand: <Placeholder>[Datum]</Placeholder>
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
