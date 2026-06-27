"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/auth";

export async function logout() {
  (await cookies()).delete(COOKIE_NAME);
  redirect("/login");
}
