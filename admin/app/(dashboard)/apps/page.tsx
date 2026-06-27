import { listApps } from "@/lib/queries";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const apps = await listApps();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Apps</h1>
        <span className="text-sm text-foreground/60">{apps.length} gesamt</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-foreground/60 dark:border-white/10">
              <th className="px-4 py-3 font-medium">App</th>
              <th className="px-4 py-3 font-medium">Besitzer</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Erstellt</th>
              <th className="px-4 py-3 font-medium">Aktualisiert</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr
                key={a.id}
                className="border-b border-black/5 last:border-0 dark:border-white/5"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{a.name}</div>
                  <div className="text-foreground/50">{a.template}</div>
                </td>
                <td className="px-4 py-3 text-foreground/70">
                  {a.ownerEmail ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {a.published ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                      veröffentlicht
                      {a.publishSlug ? ` · ${a.publishSlug}` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium text-foreground/50">
                      Entwurf
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-foreground/70">
                  {formatDate(a.createdAt)}
                </td>
                <td className="px-4 py-3 text-foreground/70">
                  {formatDate(a.updatedAt)}
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-foreground/50"
                >
                  Noch keine Apps.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
