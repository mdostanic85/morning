"use client";

import { usePathname } from "next/navigation";

export function AppFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <footer className="mx-auto w-full max-w-content px-5 pb-10 sm:px-8">
      <p className="text-xs text-muted-soft">
        Local-first evidence. Every source connection is read-only.
      </p>
    </footer>
  );
}
