import { listCoupons, listRedemptions } from "@/lib/queries";
import { formatDate, formatEur } from "@/lib/format";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n";
import { CouponForm } from "./coupon-form";

export const dynamic = "force-dynamic";

type RewardLabels = {
  pending: string;
  granted: string;
  expired: string;
  none: string;
};

function rewardBadge(status: string, labels: RewardLabels) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: {
      label: labels.pending,
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    granted: {
      label: labels.granted,
      cls: "bg-green-500/10 text-green-700 dark:text-green-400",
    },
    expired: {
      label: labels.expired,
      cls: "bg-foreground/5 text-foreground/50",
    },
    none: { label: labels.none, cls: "bg-foreground/5 text-foreground/50" },
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
  const locale: Locale = await resolveLocale();
  const m = getMessages(locale).coupons;
  const rewardLabels: RewardLabels = {
    pending: m.rewardPending,
    granted: m.rewardGranted,
    expired: m.rewardExpired,
    none: m.rewardNone,
  };

  const [coupons, redemptions] = await Promise.all([
    listCoupons(),
    listRedemptions(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{m.title}</h1>
        <span className="text-sm text-foreground/60">
          {m.summary
            .replace("{codes}", String(coupons.length))
            .replace("{redemptions}", String(redemptions.length))}
        </span>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground/70">
          {m.newCode}
        </h2>
        <CouponForm />
      </section>

      {/* All coupons */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground/70">
          {m.allCodes}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-foreground/60 dark:border-white/10">
                <th className="px-4 py-3 font-medium">{m.colCode}</th>
                <th className="px-4 py-3 font-medium">{m.colType}</th>
                <th className="px-4 py-3 font-medium">{m.colOwner}</th>
                <th className="px-4 py-3 text-right font-medium">
                  {m.colRecipient}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {m.colReferrer}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {m.colRedemptions}
                </th>
                <th className="px-4 py-3 font-medium">{m.colExpiry}</th>
                <th className="px-4 py-3 font-medium">{m.colStatus}</th>
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
                      {c.kind === "referral" ? m.typeReferral : m.typeAdmin}
                    </td>
                    <td className="px-4 py-3 text-foreground/70">
                      {c.ownerEmail ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatEur(c.recipientAmountEur, locale)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.referrerAmountEur > 0
                        ? formatEur(c.referrerAmountEur, locale)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.redemptionCount}
                      {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
                    </td>
                    <td className="px-4 py-3 text-foreground/70">
                      {c.expiresAt ? formatDate(c.expiresAt, locale) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {!c.active ? (
                        <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium text-foreground/50">
                          {m.statusInactive}
                        </span>
                      ) : expired ? (
                        <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium text-foreground/50">
                          {m.statusExpired}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                          {m.statusActive}
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
                    {m.emptyCodes}
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
          {m.redemptionsHeading}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-foreground/60 dark:border-white/10">
                <th className="px-4 py-3 font-medium">{m.colCode}</th>
                <th className="px-4 py-3 font-medium">{m.redColRedeemer}</th>
                <th className="px-4 py-3 font-medium">{m.redColReferrer}</th>
                <th className="px-4 py-3 text-right font-medium">
                  {m.redColCredit}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {m.redColReferrerBonus}
                </th>
                <th className="px-4 py-3 font-medium">{m.redColBonusStatus}</th>
                <th className="px-4 py-3 font-medium">{m.redColWhen}</th>
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
                    {formatEur(r.recipientCreditedEur, locale)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.referrerRewardEur > 0
                      ? formatEur(r.referrerRewardEur, locale)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {rewardBadge(r.referrerRewardStatus, rewardLabels)}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {formatDate(r.redeemedAt, locale)}
                  </td>
                </tr>
              ))}
              {redemptions.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-foreground/50"
                  >
                    {m.emptyRedemptions}
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
