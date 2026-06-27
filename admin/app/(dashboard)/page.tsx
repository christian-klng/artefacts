import { getTotals } from "@/lib/queries";
import { formatEur } from "@/lib/format";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-sm text-foreground/60">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function OverviewPage() {
  const t = await getTotals();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Übersicht</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Nutzer" value={String(t.userCount)} />
        <Stat label="Apps" value={String(t.appCount)} />
        <Stat label="Veröffentlicht" value={String(t.publishedCount)} />
        <Stat label="Verbraucht (gesamt)" value={formatEur(t.consumedEur)} />
        <Stat label="Guthaben (gesamt)" value={formatEur(t.balanceEur)} />
      </div>
    </div>
  );
}
