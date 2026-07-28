"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@heroui/react/button";

const LINKS = [
 { href: "/", label: "Today" },
 { href: "/projects", label: "Projects" },
 { href: "/knowledge", label: "Knowledge" },
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
 const [mobileOpen, setMobileOpen] = useState(false);

 useEffect(() => {
 const onScroll = () => setScrolled(window.scrollY > 8);
 onScroll();
 window.addEventListener("scroll", onScroll, { passive: true });
 return () => window.removeEventListener("scroll", onScroll);
 }, []);

 useEffect(() => {
 if (!mobileOpen) return;
 const onKeyDown = (event: KeyboardEvent) => {
 if (event.key === "Escape") setMobileOpen(false);
 };
 window.addEventListener("keydown", onKeyDown);
 return () => window.removeEventListener("keydown", onKeyDown);
 }, [mobileOpen]);

 return (
 <header
 className={cn(
 "sticky top-0 z-20 border-b border-border/40 bg-background/20 backdrop-blur-xl backdrop-saturate-150 transition-[background-color,border-color,box-shadow] duration-300",
 scrolled && "border-border/50 shadow-[0_1px_0_0_color-mix(in_srgb,var(--border)_35%,transparent)]"
 )}
 >
 <div
 className={cn(
 "relative mx-auto flex w-full max-w-content items-center justify-between gap-3 px-4 transition-[height] duration-300 sm:px-8",
 scrolled ? "h-[62px]" : "h-[70px]"
 )}
 >
        <Link href="/" className="group relative z-10 flex min-h-11 shrink-0 items-center">
          <Image
            src="/worklight-logo.svg"
            alt="Worklight"
            width={96}
            height={34}
            priority
            unoptimized
            className="h-[33.6px] w-[96px] transition-[transform,filter] duration-[280ms] ease-[cubic-bezier(0.16,1.35,0.3,1)] dark:brightness-110 group-hover:scale-105"
          />
        </Link>

 <nav
 className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 text-[14px] md:flex"
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

 <div className="relative z-10 flex shrink-0 items-center gap-1">
 <ThemeSwitcher />
 <Button
 type="button"
 variant="ghost"
 isIconOnly
 className="size-11 p-0 md:hidden"
 aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
 aria-expanded={mobileOpen}
 aria-controls="mobile-navigation"
 onClick={() => setMobileOpen((value) => !value)}
 >
 {mobileOpen ? <XIcon className="size-5" aria-hidden /> : <MenuIcon className="size-5" aria-hidden />}
 </Button>
 </div>
 </div>

 <nav
 id="mobile-navigation"
 aria-label="Mobile navigation"
 className={cn(
 "border-t border-border/60 bg-background/95 px-4 pb-4 pt-3 backdrop-blur-xl md:hidden",
 !mobileOpen && "hidden"
 )}
 >
 <div className="mx-auto grid max-w-content gap-1">
 {LINKS.map((link) => {
 const active = isNavActive(link.href, pathname);
 return (
 <Link
 key={link.href}
 href={link.href}
 onClick={() => setMobileOpen(false)}
 aria-current={active ? "page" : undefined}
 className={cn(
 "flex min-h-11 items-center rounded-xl px-4 text-[15px] font-medium transition-colors",
 active
 ? "bg-action-primary text-action-primary-foreground"
 : "text-muted hover:bg-surface hover:text-foreground"
 )}
 >
 {link.label}
 </Link>
 );
 })}
 </div>
 </nav>
 </header>
 );
}
