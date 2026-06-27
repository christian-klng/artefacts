import { listUsers } from "@/lib/queries";
import { formatDate, formatEur } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await listUsers();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Nutzer</h1>
        <span className="text-sm text-foreground/60">{users.length} gesamt</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-foreground/60 dark:border-white/10">
              <th className="px-4 py-3 font-medium">Nutzer</th>
              <th className="px-4 py-3 font-medium">Registriert</th>
              <th className="px-4 py-3 text-right font-medium">Apps</th>
              <th className="px-4 py-3 text-right font-medium">Verbraucht</th>
              <th className="px-4 py-3 text-right font-medium">Guthaben</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b border-black/5 last:border-0 dark:border-white/5"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name ?? "—"}</div>
                  <div className="text-foreground/60">{u.email}</div>
                </td>
                <td className="px-4 py-3 text-foreground/70">
                  {formatDate(u.createdAt)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {u.appCount}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatEur(u.consumedEur)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={u.balanceEur <= 0 ? "text-red-600 dark:text-red-400" : ""}>
                    {formatEur(u.balanceEur)}
                  </span>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-foreground/50"
                >
                  Noch keine Nutzer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
