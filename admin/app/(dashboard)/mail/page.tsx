import { getMailTemplates } from "@/lib/queries";
import { MailForm } from "./mail-form";

export const dynamic = "force-dynamic";

export default async function MailPage() {
  const templates = await getMailTemplates();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">E-Mail-Vorlagen</h1>
      </div>

      <p className="max-w-2xl text-sm text-foreground/60">
        Betreff und HTML für die Begrüßungs- und die Passwort-zurücksetzen-Mail.
        Lässt du ein Feld leer, verwendet die App ihre eingebaute Standardvorlage.
        Platzhalter in geschweiften Klammern werden beim Versand ersetzt.
      </p>

      <MailForm welcome={templates.welcome} reset={templates.reset} />
    </div>
  );
}
