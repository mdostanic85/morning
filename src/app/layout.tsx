import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import Script from "next/script";
import { NavBar } from "@/components/NavBar";
import { WelcomeModal } from "@/components/WelcomeModal";
import { AskMemoryProvider } from "@/components/AskMemoryWidget";
import { Toast } from "@heroui/react/toast";
import { AppFooter } from "@/components/AppFooter";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const themeInitScript = `
  (() => {
    const key = "worklight:theme";
    let saved = null;
    try {
      saved = localStorage.getItem(key);
    } catch {}
    const theme =
      saved === "light" || saved === "dark"
        ? saved
        : matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  })();
`;

export const metadata: Metadata = {
  title: "Worklight | Daily Work Operator",
  description:
    "Evidence-backed daily direction for what matters, what to do next, and what done looks like.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="worklight-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-action-primary px-4 py-3 font-medium text-action-primary-foreground focus:not-sr-only"
        >
          Skip to main content
        </a>
        <Suspense fallback={null}>
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
        </Suspense>
      </body>
    </html>
  );
}
