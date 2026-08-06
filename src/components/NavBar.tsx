"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpenIcon,
  CircleHelpIcon,
  FolderKanbanIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  SunIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { SignOutControl } from "@/components/auth/SignOutControl";
import { Button } from "@heroui/react/button";

const PRIMARY_LINKS = [
  { href: "/", label: "Today", icon: SunIcon },
  { href: "/projects", label: "Projects", icon: FolderKanbanIcon },
  { href: "/knowledge", label: "Knowledge", icon: BookOpenIcon },
] as const;

const SECONDARY_LINKS = [
  { href: "/how-ai-works", label: "How we decide", icon: CircleHelpIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
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

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: (typeof PRIMARY_LINKS)[number]["icon"];
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-200",
        active
          ? "bg-action-primary text-action-primary-foreground"
          : "text-muted hover:bg-surface/70 hover:text-foreground"
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const secondaryActive = SECONDARY_LINKS.some((link) => isNavActive(link.href, pathname));

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [moreOpen]);

  return (
    <>
      {/* Desktop floating expanded sidebar */}
      <aside
        className="sticky top-3 z-20 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] w-56 shrink-0 flex-col rounded-2xl border border-border/60 bg-background/85 p-3 shadow-[var(--elevation-raised)] backdrop-blur-xl backdrop-saturate-150 md:flex"
        aria-label="Main navigation"
      >
        <Link
          href="/"
          className="group mb-5 flex min-h-11 items-center px-2"
          aria-label="Worklight home"
        >
          <Image
            src="/worklight-logo.svg"
            alt="Worklight"
            width={96}
            height={34}
            priority
            unoptimized
            className="h-7 w-auto transition-[transform,filter] duration-[280ms] ease-[cubic-bezier(0.16,1.35,0.3,1)] dark:brightness-110 group-hover:scale-105"
          />
        </Link>

        <nav className="flex flex-col gap-1" aria-label="Primary">
          {PRIMARY_LINKS.map((link) => (
            <SidebarLink
              key={link.href}
              href={link.href}
              label={link.label}
              icon={link.icon}
              active={isNavActive(link.href, pathname)}
            />
          ))}
        </nav>

        <div className="mt-auto border-t border-border/60 pt-3">
          <nav className="grid gap-1" aria-label="Secondary">
            {SECONDARY_LINKS.map((link) => (
              <SidebarLink
                key={link.href}
                href={link.href}
                label={link.label}
                icon={link.icon}
                active={isNavActive(link.href, pathname)}
              />
            ))}
          </nav>
          <div className="mt-3 border-t border-border/60 px-1 py-3">
            <ThemeSwitcher />
          </div>
          <div className="border-t border-border/60 pt-2">
            <SignOutControl />
          </div>
        </div>
      </aside>

      {/* Mobile top utility strip */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/20 backdrop-blur-xl backdrop-saturate-150 md:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link href="/" className="group flex min-h-11 items-center">
            <Image
              src="/worklight-logo.svg"
              alt="Worklight"
              width={96}
              height={34}
              priority
              unoptimized
              className="h-[28px] w-auto transition-[transform,filter] duration-[280ms] ease-[cubic-bezier(0.16,1.35,0.3,1)] dark:brightness-110 group-hover:scale-105"
            />
          </Link>
          <ThemeSwitcher />
        </div>
      </header>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid max-w-content grid-cols-4 gap-1 px-2 py-1.5">
          {PRIMARY_LINKS.map((link) => {
            const active = isNavActive(link.href, pathname);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-action-primary/12 text-action-primary"
                    : "text-muted hover:bg-surface hover:text-foreground"
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span>{link.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-navigation"
            aria-current={secondaryActive ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors",
              moreOpen || secondaryActive
                ? "bg-action-primary/12 text-action-primary"
                : "text-muted hover:bg-surface hover:text-foreground"
            )}
          >
            <MoreHorizontalIcon className="size-5" aria-hidden />
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* Mobile More / Browse sheet */}
      {moreOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            aria-label="Close more navigation"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="mobile-more-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-border bg-overlay px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 text-overlay-foreground shadow-lg"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">More</h2>
              <Button
                type="button"
                variant="ghost"
                isIconOnly
                className="size-11 p-0"
                aria-label="Close"
                onClick={() => setMoreOpen(false)}
              >
                <XIcon className="size-5" aria-hidden />
              </Button>
            </div>
            <div className="grid gap-1">
              {SECONDARY_LINKS.map((link) => {
                const active = isNavActive(link.href, pathname);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-4 text-[15px] font-medium transition-colors",
                      active
                        ? "bg-action-primary text-action-primary-foreground"
                        : "text-muted hover:bg-surface hover:text-foreground"
                    )}
                  >
                    <Icon className="size-5 shrink-0 opacity-80" aria-hidden />
                    {link.label}
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 border-t border-border/60 pt-2">
              <SignOutControl />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
