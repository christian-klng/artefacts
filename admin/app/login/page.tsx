import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { Logo } from "@/app/logo";
import { LoginForm } from "./login-form";
import { LocaleToggle } from "@/app/locale-toggle";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Skip the form.
  const session = await verifySession(
    (await cookies()).get(COOKIE_NAME)?.value,
  );
  if (session) redirect("/");

  const msgs = getMessages(await resolveLocale());

  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="absolute right-4 top-4">
        <LocaleToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="mx-auto mb-3 h-12 w-12" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Kubikraum{" "}
            <span className="text-foreground/40">{msgs.chrome.adminBadge}</span>
          </h1>
          <p className="mt-1 text-sm text-foreground/60">{msgs.login.subtitle}</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
