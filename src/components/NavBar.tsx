"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanbanIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { SignOutControl } from "@/components/auth/SignOutControl";

const PRIMARY_LINKS = [
  { href: "/", label: "Today", icon: SunIcon },
  { href: "/projects", label: "Projects", icon: FolderKanbanIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

/** Routes that live under Settings as a hub, not as top-level destinations. */
const SETTINGS_HUB_PREFIXES = [
  "/settings",
  "/schedule",
  "/reports",
  "/audit",
  "/sources",
  "/knowledge",
  "/how-ai-works",
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

function TopLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors duration-200",
        active
          ? "bg-foreground/[0.07] text-foreground"
          : "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}

export function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop — floating pill inside content container */}
      <div className="pointer-events-none sticky top-0 z-20 hidden md:block">
        <div className="mx-auto w-full max-w-content p-[var(--today-main-padding-tablet)] lg:p-[var(--today-main-padding)]">
          <header
            className="pointer-events-auto grid h-12 w-full grid-cols-[1fr_auto_1fr] items-center rounded-full border border-border/50 bg-surface-raised/80 px-2.5 shadow-[0_8px_30px_-12px_rgba(16,32,51,0.18)] backdrop-blur-xl backdrop-saturate-150 dark:border-border/40 dark:bg-surface-raised/70 dark:shadow-[0_10px_36px_-14px_rgba(0,0,0,0.55)]"
            aria-label="Main navigation"
          >
            <Link
              href="/"
              className="group flex w-fit shrink-0 items-center rounded-full px-2.5 py-1"
              aria-label="Worklight home"
            >
              <Image
                src="/worklight-logo.svg"
                alt="Worklight"
                width={128}
                height={44}
                priority
                unoptimized
                className="h-7 w-auto transition-[transform,filter] duration-[280ms] ease-[cubic-bezier(0.16,1.35,0.3,1)] dark:brightness-110 group-hover:scale-[1.03]"
              />
            </Link>

            <nav
              className="flex items-center justify-center gap-0.5"
              aria-label="Primary"
            >
              {PRIMARY_LINKS.map((link) => (
                <TopLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  active={isNavActive(link.href, pathname)}
                />
              ))}
            </nav>

            <div className="flex items-center justify-end gap-0.5 pr-0.5">
              <ThemeSwitcher />
              <SignOutControl compact />
            </div>
          </header>
        </div>
      </div>

      {/* Mobile top — floating logo island inside content container */}
      <div className="pointer-events-none sticky top-0 z-20 md:hidden">
        <div className="mx-auto flex w-full max-w-content items-center justify-between gap-3 p-[var(--today-main-padding-mobile)] sm:p-[var(--today-main-padding-tablet)]">
          <Link
            href="/"
            className="pointer-events-auto group inline-flex min-h-11 items-center rounded-full border border-border/50 bg-surface-raised/80 px-3.5 py-1.5 shadow-[0_8px_24px_-12px_rgba(16,32,51,0.16)] backdrop-blur-xl dark:border-border/40 dark:bg-surface-raised/70"
          >
            <Image
              src="/worklight-logo.svg"
              alt="Worklight"
              width={128}
              height={44}
              priority
              unoptimized
              className="h-7 w-auto transition-[transform,filter] duration-[280ms] ease-[cubic-bezier(0.16,1.35,0.3,1)] dark:brightness-110 group-hover:scale-[1.03]"
            />
          </Link>
          <div className="pointer-events-auto inline-flex items-center rounded-full border border-border/50 bg-surface-raised/80 p-0.5 shadow-[0_8px_24px_-12px_rgba(16,32,51,0.16)] backdrop-blur-xl dark:border-border/40 dark:bg-surface-raised/70">
            <ThemeSwitcher />
          </div>
        </div>
      </div>

      {/* Mobile bottom — floating dock */}
      <nav
        aria-label="Primary"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="pointer-events-auto mx-auto flex max-w-sm items-center justify-around gap-1 rounded-full border border-border/50 bg-surface-raised/90 p-1.5 shadow-[0_12px_40px_-10px_rgba(16,32,51,0.28)] backdrop-blur-xl backdrop-saturate-150 dark:border-border/40 dark:bg-surface-raised/80 dark:shadow-[0_14px_44px_-12px_rgba(0,0,0,0.6)]">
          {PRIMARY_LINKS.map((link) => {
            const active = isNavActive(link.href, pathname);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-foreground/[0.08] text-foreground"
                    : "text-muted hover:text-foreground"
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
