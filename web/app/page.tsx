import { redirect } from "next/navigation";
import { auth } from "@/auth";

// The builder's root is no longer a marketing splash — that lives on the
// separate landing site (kubikraum.digital). Here we just send the visitor on:
// logged in → their most recent app, otherwise → login.
export default async function Home() {
  const session = await auth();
  redirect(session?.user ? "/app" : "/login");
}
