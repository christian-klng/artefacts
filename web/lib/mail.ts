import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// SMTP mailer (e.g. IONOS). Configured entirely via env so credentials and the
// sender address never live in code. The transporter is reused across hot
// reloads, mirroring the DB pool in lib/db.

function buildTransport(): Transporter {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS).",
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    // true for port 465 (implicit TLS), false for 587 (STARTTLS).
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
}

const globalForMail = globalThis as unknown as { transporter?: Transporter };

// Built lazily on first send so importing this module never throws when SMTP
// is unconfigured (e.g. local dev) — only actually sending a mail requires it.
function getTransport(): Transporter {
  const transporter = globalForMail.transporter ?? buildTransport();
  globalForMail.transporter = transporter;
  return transporter;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await getTransport().sendMail({ from, ...opts });
}

/** Public base URL of the builder, used to build links in emails. */
export function appBaseUrl(): string {
  return (
    process.env.AUTH_URL?.replace(/\/$/, "") || "http://localhost:3000"
  );
}
