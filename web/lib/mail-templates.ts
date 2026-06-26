import "server-only";

// Email templates. Defaults live here; each can be overridden via an env var
// (e.g. MAIL_WELCOME_HTML) so the deployer can change copy without a rebuild.
// Templates use {{placeholder}} tokens, filled in by `render`.

const WELCOME_SUBJECT_DEFAULT = "Willkommen bei artefacts 🎉";

const WELCOME_HTML_DEFAULT = `<!doctype html><html lang="de"><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
<tr><td style="background:#18181b;padding:24px 32px;"><span style="color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.02em;">artefacts</span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#18181b;">Willkommen, {{name}} 🎉</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">danke für deine Registrierung bei <strong>artefacts</strong>! Ab jetzt baust du komplette Web-Apps einfach aus einem Prompt – mit Live-Vorschau direkt im Browser.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">Beschreib einfach, was du bauen willst, und leg los.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#18181b;"><a href="{{appUrl}}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;">Jetzt loslegen →</a></td></tr></table>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e4e4e7;"><p style="margin:0;font-size:12px;color:#a1a1aa;">Diese Mail wurde an dich gesendet, weil ein Konto bei artefacts erstellt wurde. kubikraum.digital</p></td></tr>
</table></td></tr></table></body></html>`;

const RESET_SUBJECT_DEFAULT = "Passwort zurücksetzen";

const RESET_HTML_DEFAULT = `<!doctype html><html lang="de"><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
<tr><td style="background:#18181b;padding:24px 32px;"><span style="color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.02em;">artefacts</span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#18181b;">Passwort zurücksetzen</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">Hallo,</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">du hast angefordert, dein Passwort zurückzusetzen. Klick auf den Button, um ein neues Passwort festzulegen. Der Link ist <strong>{{expiresHours}} Stunde(n)</strong> gültig.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#18181b;"><a href="{{resetUrl}}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;">Neues Passwort festlegen →</a></td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#71717a;">Funktioniert der Button nicht, kopiere diesen Link in deinen Browser:<br><a href="{{resetUrl}}" style="color:#2563eb;word-break:break-all;">{{resetUrl}}</a></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#71717a;">Hast du das nicht angefordert? Dann ignoriere diese E-Mail – dein Passwort bleibt unverändert.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e4e4e7;"><p style="margin:0;font-size:12px;color:#a1a1aa;">Aus Sicherheitsgründen verfällt dieser Link nach einmaliger Nutzung. kubikraum.digital</p></td></tr>
</table></td></tr></table></body></html>`;

/** Replaces every {{key}} token with the matching value (HTML-escaped). */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in vars ? escapeHtml(vars[key]) : "",
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function welcomeEmail(vars: { name: string; appUrl: string }) {
  return {
    subject: process.env.MAIL_WELCOME_SUBJECT || WELCOME_SUBJECT_DEFAULT,
    html: render(process.env.MAIL_WELCOME_HTML || WELCOME_HTML_DEFAULT, vars),
  };
}

export function resetEmail(vars: { resetUrl: string; expiresHours: string }) {
  return {
    subject: process.env.MAIL_RESET_SUBJECT || RESET_SUBJECT_DEFAULT,
    html: render(process.env.MAIL_RESET_HTML || RESET_HTML_DEFAULT, vars),
  };
}
