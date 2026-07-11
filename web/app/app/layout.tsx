import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Home } from "lucide-react";
import { auth } from "@/auth";
import { listProjects } from "@/lib/projects";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const projects = await listProjects(session.user.id);
  const m = getMessages(await resolveLocale());

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 font-semibold">
            <Image
              src="/brand/logo-on-light.svg"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 dark:hidden"
            />
            <Image
              src="/brand/logo-on-dark.svg"
              alt=""
              width={24}
              height={24}
              className="hidden h-6 w-6 dark:block"
            />
            Kubikraum
          </span>
          <ProjectSwitcher
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          />
          <Link
            href="/app/apps"
            aria-label={m.gallery.homeAria}
            title={m.gallery.homeAria}
            className="flex items-center justify-center rounded-md border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
          >
            <Home className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu name={session.user.name} email={session.user.email} />
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
