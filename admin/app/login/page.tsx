import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Skip the form.
  const session = await verifySession(
    (await cookies()).get(COOKIE_NAME)?.value,
  );
  if (session) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            artefacts <span className="text-foreground/40">Admin</span>
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Bitte anmelden, um fortzufahren.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
