"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOutIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SignOutControl({ compact = false }: { compact?: boolean }) {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <button
        type="button"
        className={cn(
          "flex items-center font-medium text-muted transition-colors hover:text-foreground",
          compact
            ? "min-h-9 gap-1.5 rounded-lg px-2 text-[13px] hover:bg-surface/60"
            : "min-h-11 w-full justify-start gap-3 rounded-xl px-3 text-sm hover:bg-surface/70"
        )}
      >
        <LogOutIcon
          className={cn("shrink-0", compact ? "size-3.5" : "size-5")}
          aria-hidden
        />
        Sign out
      </button>
    </SignOutButton>
  );
}
