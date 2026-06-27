import { logout } from "./actions";
import { Nav } from "./nav";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-background/80 backdrop-blur dark:border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight">
              artefacts <span className="text-foreground/40">Admin</span>
            </span>
            <Nav />
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              Abmelden
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
