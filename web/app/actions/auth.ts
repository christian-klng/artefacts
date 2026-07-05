"use server";

import { createHash, randomBytes } from "node:crypto";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { appBaseUrl, sendMail } from "@/lib/mail";
import { resetEmail, welcomeEmail } from "@/lib/mail-templates";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale, type Messages } from "@/lib/i18n";

export type AuthState = { error?: string; success?: boolean } | undefined;

// Schemas are built per request so their validation messages are localised.
type AuthMessages = Messages["auth"];

// Only allow same-origin relative paths as a post-auth destination, so a
// crafted `redirectTo` form value can't turn into an open redirect. Defaults to
// the workspace.
function safeRedirect(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/app";
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const RESET_TTL_HOURS = Number(process.env.MAIL_RESET_TTL_HOURS || 1);

const signupSchema = (t: AuthMessages) =>
  z.object({
    name: z.string().trim().min(1).optional(),
    email: z.email({ error: t.errEmailInvalid }),
    password: z.string().min(8, { error: t.errPasswordMin }),
  });

export async function authenticate(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeRedirect(formData.get("redirectTo")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const t = getMessages(await resolveLocale()).auth;
      return { error: t.errInvalidCredentials };
    }
    // Re-throw redirect signals (NEXT_REDIRECT) so navigation works.
    throw error;
  }
}

export async function signup(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const locale = await resolveLocale();
  const t = getMessages(locale).auth;
  const parsed = signupSchema(t).safeParse({
    name: formData.get("name") || undefined,
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t.errInvalidInput };
  }

  const { name, email, password } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return { error: t.errAccountExists };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({ name, email, passwordHash });

  // Fire-and-forget: a failed welcome mail must not block signup.
  try {
    const { subject, html } = await welcomeEmail(
      {
        name: name || (locale === "de" ? "an Bord" : "aboard"),
        appUrl: `${appBaseUrl()}/app`,
      },
      locale,
    );
    await sendMail({ to: email, subject, html });
  } catch (error) {
    console.error("Failed to send welcome email:", error);
  }

  await signIn("credentials", {
    email,
    password,
    redirectTo: safeRedirect(formData.get("redirectTo")),
  });
}

const forgotSchema = (t: AuthMessages) =>
  z.object({
    email: z.email({ error: t.errEmailInvalid }),
  });

// Always returns success — never reveals whether an account exists.
export async function requestPasswordReset(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = getMessages(await resolveLocale()).auth;
  const parsed = forgotSchema(t).safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t.errInvalidInput };
  }
  const { email } = parsed.data;

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (user) {
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000);
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256(token),
      expires,
    });

    // Localise to the user's saved language if they have one, else the language
    // of the current request (the person filling out the forgot-password form).
    const emailLocale = isLocale(user.locale)
      ? user.locale
      : await resolveLocale();

    try {
      const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;
      const { subject, html } = await resetEmail(
        { resetUrl, expiresHours: String(RESET_TTL_HOURS) },
        emailLocale,
      );
      await sendMail({ to: email, subject, html });
    } catch (error) {
      console.error("Failed to send reset email:", error);
    }
  }

  return { success: true };
}

const resetSchema = (t: AuthMessages) =>
  z.object({
    token: z.string().min(1),
    password: z.string().min(8, { error: t.errPasswordMin }),
  });

export async function resetPassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = getMessages(await resolveLocale()).auth;
  const parsed = resetSchema(t).safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t.errInvalidInput };
  }
  const { token, password } = parsed.data;

  const tokenHash = sha256(token);
  const record = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      isNull(passwordResetTokens.usedAt),
    ),
  });

  if (!record || record.expires < new Date()) {
    return { error: t.errResetInvalid };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, record.userId),
  });
  if (!user) {
    return { error: t.errResetInvalid };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, record.id));
  });

  // Log the user straight in with their fresh password.
  await signIn("credentials", {
    email: user.email,
    password,
    redirectTo: "/app",
  });
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
