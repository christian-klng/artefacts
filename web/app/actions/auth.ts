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

export type AuthState = { error?: string; success?: boolean } | undefined;

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

const signupSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.email({ error: "Please enter a valid email." }),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters." }),
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
      return { error: "Invalid email or password." };
    }
    // Re-throw redirect signals (NEXT_REDIRECT) so navigation works.
    throw error;
  }
}

export async function signup(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name") || undefined,
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { name, email, password } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({ name, email, passwordHash });

  // Fire-and-forget: a failed welcome mail must not block signup.
  try {
    const { subject, html } = await welcomeEmail({
      name: name || "an Bord",
      appUrl: `${appBaseUrl()}/app`,
    });
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

const forgotSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }),
});

// Always returns success — never reveals whether an account exists.
export async function requestPasswordReset(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
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

    try {
      const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;
      const { subject, html } = await resetEmail({
        resetUrl,
        expiresHours: String(RESET_TTL_HOURS),
      });
      await sendMail({ to: email, subject, html });
    } catch (error) {
      console.error("Failed to send reset email:", error);
    }
  }

  return { success: true };
}

const resetSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters." }),
});

export async function resetPassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
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
    return { error: "This reset link is invalid or has expired." };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, record.userId),
  });
  if (!user) {
    return { error: "This reset link is invalid or has expired." };
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
