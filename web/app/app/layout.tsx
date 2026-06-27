import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { logout } from "@/app/actions/auth";
import { listProjects } from "@/lib/projects";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

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
        </div>
        <div className="flex items-center gap-4 text-sm">
          <ThemeToggle />
          <span className="text-neutral-500">{session.user.email}</span>
          <form action={logout}>
            <button type="submit" className="underline">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
