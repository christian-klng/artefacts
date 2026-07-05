import "server-only";

// Stripe secrets — env-only, deliberately NOT in the app_setting table (mirrors
// CORTECS_API_KEY / BACKUP_CRON_SECRET). Unset → the getters return null and
// every caller fails safe: the webhook route 503s, checkout links/portal are
// hidden. The non-secret Payment Link URLs live in lib/cortecs/config.ts.

export function stripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key && key.trim() !== "" ? key : null;
}

export function stripeWebhookSecret(): string | null {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  return s && s.trim() !== "" ? s : null;
}
