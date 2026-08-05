import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import { AppChrome } from "@/components/AppChrome";
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
        <ClerkProvider
          signInUrl="/sign-in"
          afterSignOutUrl="/sign-in"
          appearance={{
            variables: {
              colorPrimary: "#0b2f67",
              colorBackground: "#ffffff",
              colorForeground: "#0b2f67",
              colorMutedForeground: "#627083",
              borderRadius: "0.75rem",
            },
          }}
        >
          <a
            href="#main-content"
            className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-action-primary px-4 py-3 font-medium text-action-primary-foreground focus:not-sr-only"
          >
            Skip to main content
          </a>
          <Suspense fallback={null}>
            <AppChrome>{children}</AppChrome>
          </Suspense>
        </ClerkProvider>
      </body>
    </html>
  );
}
