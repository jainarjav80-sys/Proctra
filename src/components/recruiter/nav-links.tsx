"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Interviews", match: (p: string) => p.startsWith("/dashboard") || p.startsWith("/interviews") },
  { href: "/jobs", label: "Jobs", match: (p: string) => p.startsWith("/jobs") },
];

/** Primary recruiter navigation with the current section marked (aria-current). */
export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring rounded-md px-2 py-1.5 transition-colors hover:text-foreground",
              active ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
