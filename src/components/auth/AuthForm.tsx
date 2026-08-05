"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { cn } from "@/lib/utils";

type AuthMode = "sign-in" | "sign-up";

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

function fieldMessage(
  error: { message?: string; longMessage?: string } | null | undefined
): string | null {
  if (!error) return null;
  return error.longMessage || error.message || null;
}

function clerkErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const record = error as {
      message?: string;
      longMessage?: string;
      errors?: Array<{ message?: string; longMessage?: string; code?: string }>;
    };
    const first = record.errors?.[0];
    const code = first?.code || "";
    if (
      code.includes("oauth") ||
      code.includes("external_account") ||
      /not enabled|strategy/i.test(first?.message || record.message || "")
    ) {
      return "Google sign-in is not enabled yet. Use email and password, or enable Google in the Clerk Dashboard.";
    }
    return (
      first?.longMessage ||
      first?.message ||
      record.longMessage ||
      record.message ||
      fallback
    );
  }
  return fallback;
}

async function goHome(
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

const fieldClassName =
  "h-12 w-full rounded-xl border border-border bg-background px-3.5 text-[15px] text-foreground shadow-none outline-none transition-[border-color,box-shadow] placeholder:text-muted-soft focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-foreground/10";

export function AuthForm() {
  const router = useRouter();
  const {
    signIn,
    errors: signInErrors,
    fetchStatus: signInStatus,
  } = useSignIn();
  const {
    signUp,
    errors: signUpErrors,
    fetchStatus: signUpStatus,
  } = useSignUp();

  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const busy = signInStatus === "fetching" || signUpStatus === "fetching";
  const ready = Boolean(signIn && signUp);

  const emailError =
    mode === "sign-in"
      ? fieldMessage(signInErrors.fields.identifier)
      : fieldMessage(signUpErrors.fields.emailAddress);
  const passwordError =
    mode === "sign-in"
      ? fieldMessage(signInErrors.fields.password)
      : fieldMessage(signUpErrors.fields.password);
  const codeError = fieldMessage(signUpErrors.fields.code);

  async function continueWithGoogle() {
    setFormError(null);
    if (!signIn || !signUp) {
      setFormError("Sign-in is still loading. Try again in a moment.");
      return;
    }

    const origin = window.location.origin;
    const params = {
      strategy: "oauth_google" as const,
      redirectUrl: `${origin}/`,
      redirectCallbackUrl: `${origin}/sso-callback`,
    };

    try {
      const { error } =
        mode === "sign-up"
          ? await signUp.sso(params)
          : await signIn.sso(params);

      if (error) {
        setFormError(
          clerkErrorMessage(
            error,
            "Google sign-in failed. Try email and password, or check Google in Clerk."
          )
        );
      }
    } catch (error) {
      setFormError(
        clerkErrorMessage(
          error,
          "Google sign-in failed. Try email and password, or check Google in Clerk."
        )
      );
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!signIn || !signUp) {
      setFormError("Sign-in is still loading. Try again in a moment.");
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setFormError("Enter your email and password to continue.");
      return;
    }

    try {
      if (mode === "sign-in") {
        const { error } = await signIn.password({
          emailAddress: trimmedEmail,
          password,
        });
        if (error) {
          setFormError(
            clerkErrorMessage(
              error,
              "Could not sign in. Check your email and password."
            )
          );
          return;
        }

        if (signIn.status === "complete") {
          await signIn.finalize({
            navigate: async ({ session, decorateUrl }) => {
              if (session?.currentTask) return;
              await goHome(decorateUrl, router);
            },
          });
          return;
        }

        setFormError(
          "Additional verification is required for this account. Try Google, or finish setup in Clerk."
        );
        return;
      }

      const { error } = await signUp.password({
        emailAddress: trimmedEmail,
        password,
      });
      if (error) {
        setFormError(
          clerkErrorMessage(error, "Could not create your account. Try again.")
        );
        return;
      }

      if (signUp.status === "complete") {
        await signUp.finalize({
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            await goHome(decorateUrl, router);
          },
        });
        return;
      }

      if (signUp.unverifiedFields.includes("email_address")) {
        const { error: sendError } =
          await signUp.verifications.sendEmailCode();
        if (sendError) {
          setFormError(
            clerkErrorMessage(
              sendError,
              "Account created, but we could not send a verification email."
            )
          );
          return;
        }
        setVerifying(true);
        return;
      }

      setFormError(
        "Your account needs another step before it is ready. Check your email or try again."
      );
    } catch (error) {
      setFormError(
        clerkErrorMessage(
          error,
          mode === "sign-in"
            ? "Could not sign in. Check your email and password."
            : "Could not create your account. Try again."
        )
      );
    }
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!signUp) {
      setFormError("Sign-up is still loading. Try again in a moment.");
      return;
    }

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setFormError("Enter the verification code from your email.");
      return;
    }

    try {
      const { error } = await signUp.verifications.verifyEmailCode({
        code: trimmedCode,
      });
      if (error) {
        setFormError(
          clerkErrorMessage(error, "That code did not work. Try again.")
        );
        return;
      }

      if (signUp.status === "complete") {
        await signUp.finalize({
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            await goHome(decorateUrl, router);
          },
        });
        return;
      }

      setFormError("Email verified, but sign-up is not complete yet.");
    } catch (error) {
      setFormError(
        clerkErrorMessage(error, "That code did not work. Try again.")
      );
    }
  }

  if (verifying) {
    return (
      <div className="flex w-full flex-col gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Check your email
          </h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
            Enter the verification code we sent to {email.trim() || "you"}.
          </p>
        </div>

        <form onSubmit={verifyEmail} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="auth-code"
              className="text-sm font-medium text-foreground"
            >
              Verification code
            </label>
            <Input
              id="auth-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              className={fieldClassName}
              aria-invalid={Boolean(codeError)}
              aria-describedby={codeError ? "auth-code-error" : undefined}
            />
            {codeError ? (
              <p id="auth-code-error" className="text-sm text-danger" role="alert">
                {codeError}
              </p>
            ) : null}
          </div>

          {formError ? (
            <p className="text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}

          <Button
            type="submit"
            className="h-12 w-full bg-action-primary text-[15px] font-medium text-action-primary-foreground"
            isDisabled={busy || !ready}
          >
            {busy ? "Verifying…" : "Verify email"}
          </Button>
        </form>

        <button
          type="button"
          className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => {
            void signUp?.verifications.sendEmailCode();
          }}
        >
          Resend code
        </button>

        <div id="clerk-captcha" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h2
          id="sign-in-heading"
          className="font-display text-2xl font-semibold tracking-tight text-foreground"
        >
          {mode === "sign-in" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
          {mode === "sign-in" ? (
            <>Sign in to see today&apos;s focus.</>
          ) : (
            <>Create an account to get your daily briefing.</>
          )}
        </p>
      </div>

      <Button
        type="button"
        variant="secondary"
        className="h-12 w-full justify-center gap-3 border border-border bg-surface text-[15px] font-medium text-foreground shadow-none hover:bg-surface-soft"
        isDisabled={busy || !ready}
        onPress={() => {
          void continueWithGoogle();
        }}
      >
        <GoogleMark />
        {busy ? "Connecting to Google…" : "Continue with Google"}
      </Button>

      <div className="flex items-center gap-3" aria-hidden>
        <div className="h-px flex-1 bg-border" />
        <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-soft">
          or
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submitPassword} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="auth-email"
            className="text-sm font-medium text-foreground"
          >
            Email address
          </label>
          <Input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className={fieldClassName}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "auth-email-error" : undefined}
          />
          {emailError ? (
            <p id="auth-email-error" className="text-sm text-danger" role="alert">
              {emailError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="auth-password"
            className="text-sm font-medium text-foreground"
          >
            Password
          </label>
          <Input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className={fieldClassName}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={
              passwordError ? "auth-password-error" : undefined
            }
          />
          {passwordError ? (
            <p
              id="auth-password-error"
              className="text-sm text-danger"
              role="alert"
            >
              {passwordError}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p className="text-sm text-danger" role="alert">
            {formError}
          </p>
        ) : null}

        <Button
          type="submit"
          className="h-12 w-full bg-action-primary text-[15px] font-medium text-action-primary-foreground"
          isDisabled={busy || !ready}
        >
          {busy
            ? mode === "sign-in"
              ? "Signing in…"
              : "Creating account…"
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>

      <p className="text-center text-[14px] text-muted">
        {mode === "sign-in" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className={cn(
                "font-medium text-foreground underline-offset-2 hover:underline"
              )}
              onClick={() => {
                setMode("sign-up");
                setFormError(null);
              }}
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className={cn(
                "font-medium text-foreground underline-offset-2 hover:underline"
              )}
              onClick={() => {
                setMode("sign-in");
                setFormError(null);
                setVerifying(false);
              }}
            >
              Sign in
            </button>
          </>
        )}
      </p>

      <p className="text-[13px] leading-relaxed text-muted-soft">
        Gmail and other work sources connect separately after you sign in.
      </p>

      {/* Required when Clerk bot protection is enabled for sign-up */}
      <div id="clerk-captcha" />
    </div>
  );
}
