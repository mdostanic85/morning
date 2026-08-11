"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export function AppFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <footer className="mx-auto w-full max-w-content px-5 pb-10 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-metadata text-muted-soft">
        <span>Google source connections are read-only.</span>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/google-data">Google data use</Link>
        <Link href="/data-deletion">Data deletion</Link>
      </div>
    </footer>
  );
}
