"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

const LINKS = [
 { href: "/", label: "Today" },
 { href: "/how-ai-works", label: "How we decide" },
 { href: "/settings", label: "Settings" },
] as const;

/** Routes that live under Settings as a hub, not as top-level destinations. */
const SETTINGS_HUB_PREFIXES = [
 "/settings",
 "/schedule",
 "/reports",
 "/audit",
 "/sources",
] as const;

function isNavActive(href: string, pathname: string): boolean {
 if (href === "/") return pathname === "/";
 if (href === "/settings") {
 return SETTINGS_HUB_PREFIXES.some(
 (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
 );
 }
 return pathname.startsWith(href);
}

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
 <header
 className={cn(
 "sticky top-0 z-20 border-b border-border/40 bg-background/20 backdrop-blur-xl backdrop-saturate-150 transition-[background-color,border-color,box-shadow] duration-300",
 scrolled && "border-border/50 shadow-[0_1px_0_0_color-mix(in_srgb,var(--border)_35%,transparent)]"
 )}
 >
 <div
 className={cn(
 "relative mx-auto flex w-full max-w-content items-center justify-between gap-4 px-5 transition-[height] duration-300 sm:px-8",
 scrolled ? "h-[62px]" : "h-[70px]"
 )}
 >
 {/* Brand: monogram tile + wordmark */}
 <Link
 href="/"
 className="group relative z-10 flex shrink-0 items-center gap-3 font-display text-[16px] font-semibold tracking-tight"
 >
 <span
 className="brand-mark transition-[transform,box-shadow] duration-[280ms] ease-[cubic-bezier(0.16,1.35,0.3,1)] group-hover:-rotate-3 group-hover:scale-106 group-hover:shadow-[0_10px_26px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
 aria-hidden
 >
 W
 </span>
 Worklight
 </Link>

 {/* Nav links — centered in the bar */}
 <nav
 className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 overflow-x-auto text-[14px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
 aria-label="Main navigation"
 >
 {LINKS.map((link) => {
 const active = isNavActive(link.href, pathname);
 return (
 <Link
 key={link.href}
 href={link.href}
 className={cn(
 "shrink-0 rounded-full px-3.5 py-[7px] font-medium transition-all duration-200",
 active
 ? "bg-action-primary text-action-primary-foreground"
 : "text-muted hover:bg-surface/60 hover:text-foreground"
 )}
 aria-current={active ? "page" : undefined}
 >
 {link.label}
 </Link>
 );
 })}
 </nav>

 <div className="relative z-10 shrink-0">
 <ThemeSwitcher />
 </div>
 </div>
 </header>
 );
}
