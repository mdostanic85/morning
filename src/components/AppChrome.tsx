"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NavBar } from "@/components/NavBar";
import { WelcomeModal } from "@/components/WelcomeModal";
import { AskMemoryProvider } from "@/components/AskMemoryWidget";
import { AppFooter } from "@/components/AppFooter";
import { Toast } from "@heroui/react/toast";

function isAuthShellPath(pathname: string): boolean {
  return (
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/sso-callback" ||
    pathname.startsWith("/sso-callback/")
  );
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const authShell = isAuthShellPath(pathname);

  if (authShell) {
    return <>{children}</>;
  }

  return (
    <AskMemoryProvider>
      <WelcomeModal />
      <NavBar />
      <main
        id="main-content"
        tabIndex={-1}
        className="today-main mx-auto w-full max-w-content flex-1 outline-none"
      >
        {children}
      </main>
      <AppFooter />
      <Toast.Provider placement="top" />
    </AskMemoryProvider>
  );
}
