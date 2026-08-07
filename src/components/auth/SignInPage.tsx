"use client";

import Image from "next/image";
import { ClerkLoaded, ClerkLoading } from "@clerk/nextjs";
import { AuthForm } from "@/components/auth/AuthForm";
import { SignInCoverBackground } from "@/components/auth/SignInCoverBackground";
import { SignInHeadlineCycle } from "@/components/auth/SignInHeadlineCycle";
import { SignInTimeSavings } from "@/components/auth/SignInTimeSavings";

export function SignInPage() {
  return (
    <div className="grid min-h-dvh bg-background lg:h-dvh lg:grid-cols-[minmax(28rem,1fr)_minmax(32rem,1.12fr)] lg:overflow-hidden">
      <main className="flex min-h-dvh flex-col px-6 py-6 sm:px-10 lg:h-dvh lg:min-h-0 lg:px-14 xl:px-20">
        <section
          className="mx-auto my-auto w-full max-w-[26rem] py-10"
          aria-labelledby="sign-in-heading"
        >
          <Image
            src="/worklight-logo.svg"
            alt="Worklight"
            width={180}
            height={64}
            priority
            unoptimized
            className="mb-[60px] h-[54px] w-auto dark:brightness-110"
          />

          <p className="mb-7 text-[15px] leading-relaxed text-muted lg:hidden">
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
        className="relative hidden h-dvh overflow-hidden text-white lg:flex lg:flex-col"
        style={{ backgroundColor: "#0b2f67" }}
      >
        <SignInCoverBackground />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-center gap-9 px-10 py-12 xl:gap-11 xl:px-14 xl:py-16">
          <SignInHeadlineCycle />
          <SignInTimeSavings />
        </div>
      </aside>
    </div>
  );
}
