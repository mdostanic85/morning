"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/tomorrow", label: "Tomorrow" },
  { href: "/projects", label: "Projects" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/settings", label: "Settings" },
];

export function NavBar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-20 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        className={cn(
          "mx-auto flex h-[62px] w-full max-w-5xl items-center justify-between gap-4 rounded-surface border px-4 backdrop-blur-xl transition-all duration-300 sm:px-6",
          scrolled
            ? "border-border-strong/70 bg-surface/90 shadow-soft"
            : "border-border/70 bg-surface/60"
        )}
      >
        {/* Brand: monogram tile + wordmark */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-display text-[16px] font-semibold tracking-tight"
        >
          <span className="brand-mark" aria-hidden>
            V
          </span>
          Vantage
        </Link>

        {/* Nav links */}
        <nav
          className="flex min-w-0 items-center justify-end gap-1 overflow-x-auto text-[13.5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Main navigation"
        >
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "shrink-0 rounded-lg px-3.5 py-[7px] font-medium transition-all duration-200",
                  active
                    ? "bg-accent/14 text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]"
                    : "text-muted hover:bg-surface-soft hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
