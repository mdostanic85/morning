"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOutIcon } from "lucide-react";

export function SignOutControl() {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-start gap-3 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-surface/70 hover:text-foreground"
      >
        <LogOutIcon className="size-5 shrink-0" aria-hidden />
        Sign out
      </button>
    </SignOutButton>
  );
}
