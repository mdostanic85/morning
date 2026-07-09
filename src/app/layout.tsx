import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { AskMemoryProvider } from "@/components/AskMemoryWidget";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vantage — Daily Work Operator",
  description: "What to do first, why it matters, and how you'll know it's done.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TooltipProvider delay={400}>
          <Suspense fallback={null}>
            <AskMemoryProvider>
              <NavBar />
              <main className="flex-1 w-full max-w-5xl mx-auto px-5 py-10 sm:px-8 sm:py-14">
                {children}
              </main>
              <footer className="w-full max-w-5xl mx-auto px-5 pb-10 sm:px-8">
                <p className="text-xs text-muted-soft">
                  Everything stays on this machine. Sources are read-only.
                </p>
              </footer>
              <Toaster
                position="top-center"
                richColors
                closeButton
                toastOptions={{
                  className: "font-sans text-sm",
                }}
              />
            </AskMemoryProvider>
          </Suspense>
        </TooltipProvider>
      </body>
    </html>
  );
}
