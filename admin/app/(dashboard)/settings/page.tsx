import { getAppSettings } from "@/lib/queries";
import { SettingsForm } from "./settings-form";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const m = getMessages(await resolveLocale()).settings;
  const values = await getAppSettings();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{m.title}</h1>
      </div>

      <p className="max-w-2xl text-sm text-foreground/60">{m.intro}</p>

      <SettingsForm values={values} />
    </div>
  );
}
