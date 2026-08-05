"use client";

import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

async function navigateHome(
  decorateUrl: (url: string) => string,
  router: ReturnType<typeof useRouter>
) {
  const url = decorateUrl("/");
  if (url.startsWith("http")) {
    window.location.href = url;
    return;
  }
  router.push(url);
}

export default function SSOCallbackPage() {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();
  const hasRun = useRef(false);

  useEffect(() => {
    void (async () => {
      if (!clerk.loaded || !signIn || !signUp || hasRun.current) return;
      hasRun.current = true;

      if (signIn.status === "complete") {
        await signIn.finalize({
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            await navigateHome(decorateUrl, router);
          },
        });
        return;
      }

      if (signUp.isTransferable) {
        const { error } = await signIn.create({ transfer: true });
        if (!error && (signIn.status as string) === "complete") {
          await signIn.finalize({
            navigate: async ({ session, decorateUrl }) => {
              if (session?.currentTask) return;
              await navigateHome(decorateUrl, router);
            },
          });
          return;
        }
        router.push("/sign-in");
        return;
      }

      if (signIn.isTransferable) {
        const { error } = await signUp.create({ transfer: true });
        if (!error && (signUp.status as string) === "complete") {
          await signUp.finalize({
            navigate: async ({ session, decorateUrl }) => {
              if (session?.currentTask) return;
              await navigateHome(decorateUrl, router);
            },
          });
          return;
        }
        router.push("/sign-in");
        return;
      }

      if (signUp.status === "complete") {
        await signUp.finalize({
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            await navigateHome(decorateUrl, router);
          },
        });
        return;
      }

      const existingSessionId =
        signIn.existingSession?.sessionId || signUp.existingSession?.sessionId;
      if (existingSessionId) {
        await clerk.setActive({
          session: existingSessionId,
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            await navigateHome(decorateUrl, router);
          },
        });
        return;
      }

      router.push("/sign-in");
    })();
  }, [clerk, router, signIn, signUp]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted" role="status">
        Finishing Google sign-in…
      </p>
      <div id="clerk-captcha" />
    </div>
  );
}
