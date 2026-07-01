import { getAppSettings } from "@/lib/queries";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const values = await getAppSettings();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Einstellungen</h1>
      </div>

      <p className="max-w-2xl text-sm text-foreground/60">
        Betriebs-Einstellungen für Cortecs, Billing und E-Mail. Ein gespeicherter
        Wert überschreibt die entsprechende Coolify-ENV-Variable – Änderungen
        greifen ohne Redeploy (innerhalb ~30 Sekunden). Lässt du ein Feld leer,
        nutzt die App den ENV-Wert bzw. ihren eingebauten Standard. Secrets
        (API-Key, SMTP-Passwort) bleiben in der Server-Umgebung.
      </p>

      <SettingsForm values={values} />
    </div>
  );
}
