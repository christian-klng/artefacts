import { listErrorLogs } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

/** Pretty-prints the stored context JSON; falls back to the raw string. */
function formatContext(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default async function LogsPage() {
  const locale = await resolveLocale();
  const msgs = getMessages(locale);
  const m = msgs.logs;
  const logs = await listErrorLogs();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{m.title}</h1>
        <span className="text-sm text-foreground/60">
          {msgs.common.countTotal.replace("{count}", String(logs.length))}
        </span>
      </div>
      <p className="max-w-3xl text-sm text-foreground/60">{m.intro}</p>

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-foreground/60 dark:border-white/10">
              <th className="px-4 py-3 font-medium whitespace-nowrap">
                {m.colTime}
              </th>
              <th className="px-4 py-3 font-medium">{m.colScope}</th>
              <th className="px-4 py-3 font-medium">{m.colApp}</th>
              <th className="px-4 py-3 font-medium">{m.colUser}</th>
              <th className="px-4 py-3 font-medium">{m.colMessage}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((e) => (
              <tr
                key={e.id}
                className="border-b border-black/5 align-top last:border-0 dark:border-white/5"
              >
                <td className="px-4 py-3 whitespace-nowrap text-foreground/70">
                  {formatDate(e.createdAt, locale)}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 font-mono text-xs font-medium text-foreground/70">
                    {e.scope}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground/70">
                  {e.projectName ??
                    (e.projectId ? e.projectId.slice(0, 8) : "—")}
                </td>
                <td className="px-4 py-3 text-foreground/70">
                  {e.userEmail ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-red-700 dark:text-red-400">
                    {e.message}
                  </div>
                  {(e.stack || e.context) && (
                    <details className="mt-1 group">
                      <summary className="cursor-pointer text-xs text-foreground/50 hover:text-foreground/70">
                        {m.details}
                      </summary>
                      {e.context && (
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-foreground/5 p-3 text-xs whitespace-pre-wrap text-foreground/70">
                          {formatContext(e.context)}
                        </pre>
                      )}
                      {e.stack && (
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-foreground/5 p-3 text-xs whitespace-pre-wrap text-foreground/60">
                          {e.stack}
                        </pre>
                      )}
                    </details>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-foreground/50"
                >
                  {m.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
