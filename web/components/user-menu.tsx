"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Copy, Power, User, X } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { setLocale } from "@/app/actions/settings";
import { emitCreditChanged } from "@/lib/credit-events";
import { LOCALES, type Locale } from "@/lib/i18n";
import { useLocale, useMessages } from "@/lib/i18n/provider";

// The right-hand header controls: a user-icon button that opens an account
// details modal, and a power-off button that signs out after a confirmation.
// Both modals share the §7 dropdown/modal surface; the icon buttons match the
// theme toggle so the header reads as one row of consistent controls.

const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white";

// Language endonyms — the same in either UI language, so not translated.
const LANGUAGE_LABEL: Record<Locale, string> = { de: "Deutsch", en: "English" };

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const m = useMessages();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* click-away backdrop */}
      <button
        aria-label={m.common.close}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-lg dark:border-neutral-800 dark:bg-neutral-950"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={m.common.close}
            className="text-neutral-400 transition hover:text-neutral-900 dark:hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const eur = (n: number) => `€${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

type CouponInfo = {
  activated: boolean;
  code: string | null;
  recipientAmountEur: number;
  referrerAmountEur: number;
  hasRedeemed: boolean;
  redemptions: { redeemedAt: string; rewardEur: number; rewardStatus: string }[];
  stats: { count: number; pendingEur: number; grantedEur: number };
};

function AccountInfo({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
        <User className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        {name && <p className="truncate text-sm font-medium">{name}</p>}
        <p className="truncate text-sm text-neutral-500">{email ?? "—"}</p>
      </div>
    </div>
  );
}

function LanguageTab() {
  const active = useLocale();
  const m = useMessages();
  const [pending, startTransition] = useTransition();

  function pick(locale: Locale) {
    if (locale === active || pending) return;
    startTransition(async () => {
      await setLocale(locale);
      window.location.reload();
    });
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{m.account.languageHeading}</h3>
      <div
        role="group"
        aria-label={m.localeToggle.label}
        className="inline-flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700"
      >
        {LOCALES.map((locale) => {
          const isActive = locale === active;
          return (
            <button
              key={locale}
              type="button"
              disabled={pending}
              aria-pressed={isActive}
              onClick={() => pick(locale)}
              className={`px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                isActive
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
              }`}
            >
              {LANGUAGE_LABEL[locale]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CouponTab() {
  const m = useMessages();
  const [info, setInfo] = useState<CouponInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [activating, setActivating] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchInfo = useCallback(async (): Promise<CouponInfo | null> => {
    try {
      const res = await fetch("/api/coupons/me");
      return res.ok ? ((await res.json()) as CouponInfo) : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchInfo().then((data) => {
      if (cancelled) return;
      if (data) setInfo(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchInfo]);

  async function onRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || redeeming) return;
    setRedeeming(true);
    setMsg(null);
    try {
      const res = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (typeof data.balanceEur === "number") {
          emitCreditChanged(data.balanceEur);
        }
        setMsg({
          ok: true,
          text: m.coupon.credited.replace("{amount}", eur(Number(data.creditedEur))),
        });
        setCode("");
        const fresh = await fetchInfo();
        if (fresh) setInfo(fresh);
      } else {
        setMsg({ ok: false, text: data.message ?? m.coupon.redeemFailed });
      }
    } catch {
      setMsg({ ok: false, text: m.coupon.networkError });
    } finally {
      setRedeeming(false);
    }
  }

  async function onActivate() {
    if (activating) return;
    setActivating(true);
    try {
      const res = await fetch("/api/coupons/me", { method: "POST" });
      if (res.ok) setInfo(await res.json());
    } catch {
      // no-op — button stays available to retry
    } finally {
      setActivating(false);
    }
  }

  async function onCopy() {
    if (!info?.code) return;
    try {
      await navigator.clipboard.writeText(info.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the code is still visible to copy manually
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">{m.common.loading}</p>;
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{m.coupon.redeemHeading}</h3>
        {info?.hasRedeemed ? (
          <p className="text-sm text-neutral-500">{m.coupon.alreadyRedeemed}</p>
        ) : (
          <form onSubmit={onRedeem} className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={m.coupon.codePlaceholder}
              autoCapitalize="characters"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm uppercase outline-none focus:border-neutral-500 dark:border-neutral-700"
            />
            <button
              type="submit"
              disabled={redeeming || !code.trim()}
              className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {redeeming ? "…" : m.coupon.redeem}
            </button>
          </form>
        )}
        {msg && (
          <p
            className={`text-sm ${msg.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            {msg.text}
          </p>
        )}
      </section>

      <hr className="border-neutral-200 dark:border-neutral-800" />

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{m.coupon.referralHeading}</h3>
        <p className="text-sm text-neutral-500">
          {m.coupon.inviteLine.replace(
            "{amount}",
            eur(info?.recipientAmountEur ?? 10),
          )}
        </p>
        {info?.activated && info.code ? (
          <>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-neutral-300 bg-neutral-50 px-3 py-1.5 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900">
                {info.code}
              </code>
              <button
                type="button"
                onClick={onCopy}
                aria-label={m.coupon.copyCode}
                title={m.coupon.copy}
                className={iconButton}
              >
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
            <p className="text-sm text-neutral-500">
              {info.stats.count === 0
                ? m.coupon.notRedeemedYet
                : m.coupon.redeemedCount.replace("{count}", String(info.stats.count))}
              {info.stats.pendingEur > 0 &&
                ` · ${m.coupon.bonusPending.replace("{amount}", eur(info.stats.pendingEur))}`}
              {info.stats.grantedEur > 0 &&
                ` · ${m.coupon.bonusGranted.replace("{amount}", eur(info.stats.grantedEur))}`}
            </p>
            <p className="text-xs text-neutral-400">
              {m.coupon.referrerReward.replace(
                "{amount}",
                eur(info.referrerAmountEur),
              )}
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={onActivate}
            disabled={activating}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {activating ? "…" : m.coupon.activateCode}
          </button>
        )}
      </section>
    </div>
  );
}

export function UserMenu({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  const m = useMessages();
  const [details, setDetails] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [tab, setTab] = useState<"account" | "coupon" | "language">("account");

  const closeDetails = () => {
    setDetails(false);
    setTab("account");
  };

  const tabButton = (active: boolean) =>
    `flex-1 rounded px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-white shadow-sm dark:bg-neutral-800"
        : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
    }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setDetails(true)}
        aria-label={m.account.openLabel}
        title={email ?? m.account.openLabel}
        className={iconButton}
      >
        <User className="h-4 w-4" aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => setConfirmOut(true)}
        aria-label={m.account.logout}
        title={m.account.logout}
        className={iconButton}
      >
        <Power className="h-4 w-4" aria-hidden />
      </button>

      {details && (
        <Modal title={m.account.title} onClose={closeDetails}>
          <div className="mb-4 flex gap-1 rounded-md bg-neutral-100 p-1 dark:bg-neutral-900">
            <button
              type="button"
              onClick={() => setTab("account")}
              className={tabButton(tab === "account")}
            >
              {m.account.tabAccount}
            </button>
            <button
              type="button"
              onClick={() => setTab("coupon")}
              className={tabButton(tab === "coupon")}
            >
              {m.account.tabCoupon}
            </button>
            <button
              type="button"
              onClick={() => setTab("language")}
              className={tabButton(tab === "language")}
            >
              {m.account.tabLanguage}
            </button>
          </div>

          {tab === "account" ? (
            <AccountInfo name={name} email={email} />
          ) : tab === "coupon" ? (
            <CouponTab />
          ) : (
            <LanguageTab />
          )}
        </Modal>
      )}

      {confirmOut && (
        <Modal title={m.account.logoutTitle} onClose={() => setConfirmOut(false)}>
          <p className="text-sm text-neutral-500">{m.account.logoutConfirm}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOut(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              {m.common.cancel}
            </button>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {m.account.logout}
              </button>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
