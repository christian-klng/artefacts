import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = {
  title: "AGB",
  description:
    "Allgemeine Geschäftsbedingungen von Kubikraum für Website und Builder.",
  alternates: { canonical: "/agb" },
};

// NOTE: Erste Version aus dem bekannten Geschäftsmodell + Platzhaltern (gelb
// markiert). Bitte juristisch prüfen/ergänzen lassen (insb. Widerrufsbelehrung,
// Haftung, Gerichtsstand) — dies ist keine Rechtsberatung.
export default function AgbPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          Allgemeine Geschäftsbedingungen (AGB)
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Gelten für die Nutzung von Kubikraum (Website kubikraum.digital und
          Builder app.kubikraum.digital).
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 1 Geltungsbereich und Anbieter
            </h2>
            <p>
              Diese AGB gelten für alle Verträge zwischen Christian Klang,{" "}
              <Placeholder>[Anschrift]</Placeholder> („Anbieter“), und den
              Nutzerinnen und Nutzern („Nutzer“) über die Nutzung von Kubikraum.
              Abweichende Bedingungen des Nutzers werden nicht Vertragsbestandteil,
              es sei denn, der Anbieter stimmt ihrer Geltung ausdrücklich zu.{" "}
              <Placeholder>
                [Zielgruppe präzisieren: Verbraucher und/oder Unternehmer]
              </Placeholder>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 2 Vertragsgegenstand / Leistungsbeschreibung
            </h2>
            <p>
              Kubikraum ist ein KI-gestützter Web-App-Builder: Nutzer beschreiben
              eine Web-App in natürlicher Sprache; ein KI-Agent erzeugt daraus im
              Browser eine Web-App, die als Vorschau angezeigt, exportiert und
              über eine Subdomain veröffentlicht werden kann. Der konkrete
              Funktionsumfang ergibt sich aus der jeweils aktuellen
              Leistungsbeschreibung auf der Website. Der Anbieter entwickelt den
              Dienst laufend weiter; einzelne Funktionen können sich ändern.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 3 Registrierung und Nutzerkonto
            </h2>
            <p>
              Die Nutzung des Builders setzt ein Konto voraus. Die bei der
              Registrierung angegebenen Daten müssen wahrheitsgemäß sein.
              Zugangsdaten sind geheim zu halten und vor dem Zugriff Dritter zu
              schützen. Mindestalter:{" "}
              <Placeholder>[z. B. 18 Jahre bzw. Einwilligung]</Placeholder>.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 4 Vertragsschluss
            </h2>
            <p>
              Mit der Registrierung kommt ein kostenloser Nutzungsvertrag
              zustande. Kostenpflichtige Leistungen (Guthaben-Aufladung,
              Hosting-Abo) werden separat durch Bestätigung im Bezahlvorgang
              beauftragt; der Vertrag hierüber kommt mit dieser Bestätigung
              zustande.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 5 Preise, Guthaben und Zahlung
            </h2>
            <p>
              Die Nutzung des Builders wird über ein EUR-Guthaben abgerechnet; die
              Kosten je Nutzung (insbesondere KI-Generierung) werden vom Guthaben
              abgezogen. Neue Konten erhalten ein kostenloses Start-Guthaben.
              Weiteres Guthaben kann per einmaliger Aufladung erworben werden und
              verfällt nicht. Optional kann pro App ein kostenpflichtiges
              Hosting-Abo (derzeit{" "}
              <Placeholder>[5 €/Monat]</Placeholder>) abgeschlossen werden; es
              gewährt u. a. monatlich verfallendes Guthaben und schaltet
              zukünftige Premium-Funktionen frei. Die jeweils gültigen Preise
              werden im Bezahlvorgang angezeigt; sie verstehen sich{" "}
              <Placeholder>[inkl./zzgl. gesetzl. USt. — bitte klarstellen]</Placeholder>
              . Die Zahlungsabwicklung erfolgt über den Zahlungsdienstleister
              Stripe.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 6 Laufzeit und Kündigung des Abos
            </h2>
            <p>
              Das Hosting-Abo läuft monatlich und verlängert sich automatisch um
              jeweils einen Monat, sofern es nicht gekündigt wird. Die Kündigung
              ist jederzeit zum Ende des laufenden Abrechnungszeitraums möglich
              über{" "}
              <Placeholder>[Konto-Einstellungen / Stripe-Kundenportal]</Placeholder>
              . Bereits erworbenes einmaliges Guthaben verfällt nicht; monatliches
              Abo-Guthaben verfällt zum Ende des jeweiligen Abrechnungszeitraums.{" "}
              <Placeholder>[Erstattungsregelungen ergänzen]</Placeholder>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 7 Widerrufsrecht für Verbraucher
            </h2>
            <p>
              Verbrauchern steht ein gesetzliches Widerrufsrecht zu.{" "}
              <Placeholder>
                [Vollständige Widerrufsbelehrung und Muster-Widerrufsformular
                einfügen]
              </Placeholder>{" "}
              Hinweis: Bei digitalen Inhalten und Dienstleistungen kann das
              Widerrufsrecht vorzeitig erlöschen, wenn der Nutzer ausdrücklich
              zustimmt, dass mit der Ausführung vor Ablauf der Widerrufsfrist
              begonnen wird, und seine Kenntnis vom Verlust des Widerrufsrechts
              bestätigt.{" "}
              <Placeholder>[rechtlich prüfen]</Placeholder>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 8 Rechte an Inhalten
            </h2>
            <p>
              Vom Nutzer erstellte oder eingestellte Inhalte (Prompts, generierte
              Apps, hochgeladene Dateien, App-Daten) bleiben beim Nutzer bzw. beim
              jeweiligen Rechteinhaber. Der Nutzer räumt dem Anbieter die zur
              Erbringung des Dienstes erforderlichen, einfachen Nutzungsrechte ein
              (Speichern, Verarbeiten, Anzeigen, Übermittlung an den KI-
              Auftragsverarbeiter zur Generierung sowie – auf Wunsch des Nutzers –
              Veröffentlichung der App). Der Nutzer sichert zu, dass er über die
              erforderlichen Rechte an den eingestellten Inhalten verfügt.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 9 Pflichten des Nutzers / zulässige Nutzung
            </h2>
            <p>
              Der Nutzer verpflichtet sich, keine rechtswidrigen,
              rechteverletzenden, schädlichen oder sittenwidrigen Inhalte zu
              erstellen, zu speichern oder zu veröffentlichen und die Sicherheit
              des Dienstes nicht zu beeinträchtigen oder zu umgehen. Eine
              missbräuchliche oder unverhältnismäßige Ressourcennutzung ist
              untersagt.{" "}
              <Placeholder>[detaillierte Nutzungsrichtlinie ergänzen]</Placeholder>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 10 Verfügbarkeit
            </h2>
            <p>
              Der Anbieter bemüht sich um eine hohe Verfügbarkeit des Dienstes,
              schuldet jedoch keine ununterbrochene Verfügbarkeit.
              Wartungsarbeiten, Störungen und Ereignisse höherer Gewalt können zu
              vorübergehenden Einschränkungen führen.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 11 Haftung
            </h2>
            <p>
              Der Anbieter haftet unbeschränkt bei Vorsatz und grober
              Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit,
              nach dem Produkthaftungsgesetz sowie im Umfang übernommener
              Garantien. Bei einfacher Fahrlässigkeit haftet der Anbieter nur bei
              Verletzung einer wesentlichen Vertragspflicht (Kardinalpflicht) und
              der Höhe nach begrenzt auf den vertragstypischen, vorhersehbaren
              Schaden.{" "}
              <Placeholder>[Haftungsklausel juristisch prüfen]</Placeholder>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 12 Freistellung
            </h2>
            <p>
              Der Nutzer stellt den Anbieter von Ansprüchen Dritter frei, die auf
              rechtswidrigen, vom Nutzer eingestellten Inhalten oder einer
              rechtswidrigen Nutzung des Dienstes beruhen, einschließlich
              angemessener Kosten der Rechtsverteidigung.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 13 Datenschutz
            </h2>
            <p>
              Informationen zur Verarbeitung personenbezogener Daten enthält
              unsere{" "}
              <Link
                href="/datenschutz"
                className="text-info underline underline-offset-2 hover:text-info-deep dark:hover:text-info"
              >
                Datenschutzerklärung
              </Link>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 14 Änderungen der AGB
            </h2>
            <p>
              Der Anbieter kann diese AGB mit Wirkung für die Zukunft ändern.
              Nutzer werden über Änderungen rechtzeitig informiert.{" "}
              <Placeholder>
                [Zustimmungs- bzw. Widerspruchsmechanismus und Fristen ergänzen]
              </Placeholder>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              § 15 Schlussbestimmungen
            </h2>
            <p>
              Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss
              des UN-Kaufrechts; bei Verbrauchern bleiben zwingende
              Schutzvorschriften des Staates ihres gewöhnlichen Aufenthalts
              unberührt. Gerichtsstand:{" "}
              <Placeholder>
                [soweit zulässig; bei Kaufleuten Sitz des Anbieters]
              </Placeholder>
              . Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit
              der übrigen Bestimmungen unberührt.
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
