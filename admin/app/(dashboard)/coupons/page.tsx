import { listCoupons, listRedemptions } from "@/lib/queries";
import { formatDate, formatEur } from "@/lib/format";
import { CouponForm } from "./coupon-form";

export const dynamic = "force-dynamic";

function rewardBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: {
      label: "ausstehend",
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    granted: {
      label: "gutgeschrieben",
      cls: "bg-green-500/10 text-green-700 dark:text-green-400",
    },
    expired: {
      label: "verfallen",
      cls: "bg-foreground/5 text-foreground/50",
    },
    none: { label: "—", cls: "bg-foreground/5 text-foreground/50" },
  };
  const b = map[status] ?? map.none;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}
    >
      {b.label}
    </span>
  );
}

export default async function CouponsPage() {
  const [coupons, redemptions] = await Promise.all([
    listCoupons(),
    listRedemptions(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Gutscheine</h1>
        <span className="text-sm text-foreground/60">
          {coupons.length} Codes · {redemptions.length} Einlösungen
        </span>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground/70">
          Neuer Code
        </h2>
        <CouponForm />
      </section>

      {/* All coupons */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground/70">Alle Codes</h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-foreground/60 dark:border-white/10">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Typ</th>
                <th className="px-4 py-3 font-medium">Besitzer</th>
                <th className="px-4 py-3 text-right font-medium">Einlöser</th>
                <th className="px-4 py-3 text-right font-medium">Werber</th>
                <th className="px-4 py-3 text-right font-medium">Einlösungen</th>
                <th className="px-4 py-3 font-medium">Ablauf</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const expired = c.expired;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="px-4 py-3 font-mono">{c.code}</td>
                    <td className="px-4 py-3 text-foreground/70">
                      {c.kind === "referral" ? "Referral" : "Admin"}
                    </td>
                    <td className="px-4 py-3 text-foreground/70">
                      {c.ownerEmail ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatEur(c.recipientAmountEur)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.referrerAmountEur > 0
                        ? formatEur(c.referrerAmountEur)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.redemptionCount}
                      {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
                    </td>
                    <td className="px-4 py-3 text-foreground/70">
                      {c.expiresAt ? formatDate(c.expiresAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {!c.active ? (
                        <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium text-foreground/50">
                          inaktiv
                        </span>
                      ) : expired ? (
                        <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium text-foreground/50">
                          abgelaufen
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                          aktiv
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {coupons.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-foreground/50"
                  >
                    Noch keine Codes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Redemptions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground/70">
          Einlösungen
        </h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-foreground/60 dark:border-white/10">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Einlöser</th>
                <th className="px-4 py-3 font-medium">Werber</th>
                <th className="px-4 py-3 text-right font-medium">Gutschrift</th>
                <th className="px-4 py-3 text-right font-medium">
                  Werber-Bonus
                </th>
                <th className="px-4 py-3 font-medium">Bonus-Status</th>
                <th className="px-4 py-3 font-medium">Wann</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="px-4 py-3 font-mono">{r.code ?? "—"}</td>
                  <td className="px-4 py-3 text-foreground/70">
                    {r.redeemerEmail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {r.ownerEmail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatEur(r.recipientCreditedEur)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.referrerRewardEur > 0
                      ? formatEur(r.referrerRewardEur)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {rewardBadge(r.referrerRewardStatus)}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {formatDate(r.redeemedAt)}
                  </td>
                </tr>
              ))}
              {redemptions.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-foreground/50"
                  >
                    Noch keine Einlösungen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
