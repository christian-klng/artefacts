import { Logo } from "@/app/logo";
import { logout } from "./actions";
import { Nav } from "./nav";
import { LocaleToggle } from "@/app/locale-toggle";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const m = getMessages(await resolveLocale());

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-background/80 backdrop-blur dark:border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Logo className="h-6 w-6" />
              Kubikraum{" "}
              <span className="text-foreground/40">{m.chrome.adminBadge}</span>
            </span>
            <Nav />
          </div>
          <div className="flex items-center gap-3">
            <LocaleToggle />
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                {m.chrome.logout}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
