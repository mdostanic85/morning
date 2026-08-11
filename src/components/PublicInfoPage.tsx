import Link from "next/link";
import type { ReactNode } from "react";

export function PublicInfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/about" className="text-base font-semibold tracking-tight">
            Morning
          </Link>
          <Link href="/sign-in" className="link-btn-outline">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-metadata font-semibold uppercase tracking-[0.14em] text-muted">
          {eyebrow}
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">{intro}</p>
        <div className="mt-10 space-y-8 text-base leading-7 text-muted [&_a]:text-foreground [&_a]:underline [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p]:max-w-3xl [&_ul]:space-y-2">
          {children}
        </div>
      </main>
      <footer className="border-t border-border">
        <nav className="mx-auto flex w-full max-w-4xl flex-wrap gap-x-5 gap-y-2 px-5 py-6 text-sm text-muted sm:px-8">
          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/google-data">Google data use</Link>
          <Link href="/data-deletion">Data deletion</Link>
        </nav>
      </footer>
    </div>
  );
}
