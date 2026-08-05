"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@heroui/react/button";

export function SignOutControl() {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 px-3 text-[14px] font-medium text-muted hover:text-foreground"
      >
        Sign out
      </Button>
    </SignOutButton>
  );
}
