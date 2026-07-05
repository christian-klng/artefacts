"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMessages } from "@/lib/i18n/provider";

export function Nav() {
  const pathname = usePathname();
  const m = useMessages();

  const links = [
    { href: "/", label: m.nav.overview },
    { href: "/users", label: m.nav.users },
    { href: "/apps", label: m.nav.apps },
    { href: "/coupons", label: m.nav.coupons },
    { href: "/mail", label: m.nav.mail },
    { href: "/settings", label: m.nav.settings },
  ];

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-foreground/10 text-foreground"
                : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
