import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { settingNumber, settingString } from "@/lib/settings";

// SMTP mailer (e.g. IONOS). The non-secret config (host, port, user, secure
// flag, sender) is DB-backed via lib/settings.ts so it can be changed in the
// admin app without a redeploy; the password stays an env-only secret
// (SMTP_PASS). The transporter is built per send (config can change under us and
// sends are rare), so there is no stale cached connection.

async function buildTransport(): Promise<Transporter> {
  const host = await settingString("SMTP_HOST", "");
  const port = await settingNumber("SMTP_PORT", 587);
  const user = await settingString("SMTP_USER", "");
  const pass = process.env.SMTP_PASS ?? "";

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured (set SMTP_HOST + SMTP_USER in the admin panel and SMTP_PASS in the environment).",
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    // true for port 465 (implicit TLS), false for 587 (STARTTLS).
    secure: (await settingString("SMTP_SECURE", "")) === "true",
    auth: { user, pass },
  });
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const from =
    (await settingString("MAIL_FROM", "")) ||
    (await settingString("SMTP_USER", ""));
  await (await buildTransport()).sendMail({ from, ...opts });
}

/** Public base URL of the builder, used to build links in emails. */
export function appBaseUrl(): string {
  return process.env.AUTH_URL?.replace(/\/$/, "") || "http://localhost:3000";
}
