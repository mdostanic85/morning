# Next chat handoff — Auth UI (email + Google)

## Completed work

- Login page now follows a Going-style auth card (Mobbin): Google, OR,
  email/password, Continue, Sign up / Sign in toggle.
- Added `AuthForm` with Clerk Core 3 custom flows (`useSignIn` / `useSignUp`),
  email verification step after sign-up, clearer Google errors, absolute OAuth
  redirect URLs.
- Sign out remains in NavBar (desktop + mobile).
- `.env.example` updated: enable Email + Password; Google optional.

## Current repository state

- Branch: verify with `git status` (likely `feat/gemini-public-llm`).
- Uncommitted auth UI + Clerk wiring.

## Unresolved verified issues

- Clerk Dashboard must enable **Email address + Password** for create/login.
- Google Social connection must be enabled for "Continue with Google".
- Browser E2E not verified in this chat.

## Relevant changed files

- `src/components/auth/AuthForm.tsx` (new)
- `src/components/auth/SignInPage.tsx`
- `src/components/auth/GoogleSignInButton.tsx` (removed; replaced by AuthForm)
- `.env.example`

## Test results

- `npm run test:auth-routes` — 4 passed
- `npm run build` — success

## Exact next task

In Clerk Dashboard enable Email/Password (and Google if desired), then verify
sign-up, sign-in, Google, and sign-out in the browser.

## Scope exclusions

- No other social providers.
- No task/connector/Hydra changes.

## Acceptance criteria

1. User can create an account with email + password.
2. User can sign in with email + password.
3. Google works when enabled; otherwise shows a clear error.
4. Sign out returns to `/sign-in`.

## Required input documents

- Clerk Dashboard access.
