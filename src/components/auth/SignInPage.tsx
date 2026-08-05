"use client";

import Image from "next/image";
import { ClerkLoaded, ClerkLoading } from "@clerk/nextjs";
import { AuthForm } from "@/components/auth/AuthForm";

export function SignInPage() {
  return (
    <div className="grid min-h-dvh bg-background lg:h-dvh lg:grid-cols-[minmax(26rem,0.84fr)_minmax(34rem,1.16fr)] lg:overflow-hidden">
      <main className="flex min-h-dvh flex-col px-6 py-6 sm:px-10 lg:h-dvh lg:min-h-0 lg:px-12 xl:px-16">
        <header>
          <Image
            src="/worklight-logo.svg"
            alt="Worklight"
            width={120}
            height={43}
            priority
            unoptimized
            className="h-9 w-auto dark:brightness-110"
          />
        </header>

        <section
          className="mx-auto my-auto w-full max-w-[24rem] py-8"
          aria-labelledby="sign-in-heading"
        >
          <p className="mb-6 text-[15px] leading-relaxed text-muted lg:hidden">
            One evidence-backed priority for today.
          </p>
          <ClerkLoading>
            <div
              className="flex h-40 w-full items-center justify-center rounded-xl border border-border bg-surface text-sm text-muted"
              role="status"
            >
              Loading sign-in…
            </div>
          </ClerkLoading>
          <ClerkLoaded>
            <AuthForm />
          </ClerkLoaded>
        </section>

        <footer className="text-[13px] text-muted-soft">
          Your work stays private to your account.
        </footer>
      </main>

      <aside
        className="relative hidden h-dvh overflow-hidden px-10 py-8 text-white lg:flex lg:flex-col xl:px-14"
        style={{ backgroundColor: "#0b2f67" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_8%,rgba(36,166,216,0.24),transparent_48%)]"
        />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-center gap-8">
          <div className="max-w-2xl">
            <p className="eyebrow text-white/55">Your day, already sorted</p>
            <h1 className="mt-3 text-balance font-display text-[2.8rem] font-semibold leading-[0.98] tracking-[-0.055em] xl:text-[3.65rem]">
              Know your next move before the day gets noisy.
            </h1>
            <p className="mt-4 max-w-lg text-pretty text-[16px] leading-relaxed text-white/70">
              One calm briefing with the evidence, the next action, and a clear
              finish line.
            </p>
          </div>

          <figure className="w-full max-w-[42rem] [perspective:1400px]">
            <div className="relative origin-[35%_55%] [transform:rotateX(7deg)_rotateY(-12deg)_rotateZ(1deg)] [transform-style:preserve-3d]">
              <div
                aria-hidden
                className="absolute inset-5 translate-x-7 translate-y-9 rounded-[1.35rem] bg-black/35 blur-2xl"
              />
              <div className="relative overflow-hidden rounded-[1.35rem] border border-white/20 bg-white/10 p-1.5 shadow-[0_35px_90px_-28px_rgba(0,0,0,.75)]">
                <Image
                  src="/worklight-app-preview.png"
                  alt="Worklight Today view with today's focus, next action, and evidence"
                  width={1440}
                  height={900}
                  priority
                  unoptimized
                  className="aspect-[16/10] w-full rounded-[1rem] object-cover object-[center_12%]"
                />
              </div>
            </div>
            <figcaption className="mt-4 text-[12px] text-white/45">
              Example Today briefing
            </figcaption>
          </figure>
        </div>
      </aside>
    </div>
  );
}
