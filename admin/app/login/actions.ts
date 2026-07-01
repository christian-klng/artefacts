"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  COOKIE_NAME,
  SESSION_TTL_S,
  checkCredentials,
  createSession,
} from "@/lib/auth";

export type LoginState = { error?: string };

// Read a submitted form field. Next/React normally hand the action a decoded
// FormData with the original input names ("username"). Be defensive: if the
// useActionState wire prefix ("_1_username") ever survives into the action's
// FormData, fall back to the prefixed key so the login still works.
function readField(formData: FormData, name: string): string {
  const direct = formData.get(name);
  if (typeof direct === "string") return direct;
  for (const [key, value] of formData.entries()) {
    if (
      typeof value === "string" &&
      /^_\d+_/.test(key) &&
      key.endsWith(`_${name}`)
    ) {
      return value;
    }
  }
  return "";
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = readField(formData, "username");
  const password = readField(formData, "password");

  if (!checkCredentials(username, password)) {
    return { error: "Falscher Benutzername oder falsches Passwort." };
  }

  const token = await createSession(username);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  });

  redirect("/");
}
