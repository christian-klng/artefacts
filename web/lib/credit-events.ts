// Client-side bridge: a credit change in the account modal (coupon redemption)
// updates the live balance shown in the chat composer. They live in different
// parts of the component tree, so a window CustomEvent decouples them without a
// shared context/provider.

export const CREDIT_CHANGED_EVENT = "artefacts:credit-changed";

export function emitCreditChanged(balanceEur: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CREDIT_CHANGED_EVENT, { detail: { balanceEur } }),
  );
}
