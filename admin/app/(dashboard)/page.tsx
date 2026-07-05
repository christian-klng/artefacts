import { getTotals } from "@/lib/queries";
import { formatEur } from "@/lib/format";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

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
  const locale = await resolveLocale();
  const m = getMessages(locale).overview;
  const t = await getTotals();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">{m.title}</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={m.users} value={String(t.userCount)} />
        <Stat label={m.apps} value={String(t.appCount)} />
        <Stat label={m.published} value={String(t.publishedCount)} />
        <Stat label={m.consumedTotal} value={formatEur(t.consumedEur, locale)} />
        <Stat label={m.balanceTotal} value={formatEur(t.balanceEur, locale)} />
      </div>
    </div>
  );
}
