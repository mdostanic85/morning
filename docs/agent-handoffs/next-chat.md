# Next chat handoff — Floating expanded navigation review

## Completed work

- Replaced the centered topbar with a floating expanded desktop sidebar,
  combining the detached panel treatment from Mobbin's Biosites reference
  with the expanded hierarchy and explicit sign-out treatment from Superlist.
- Desktop: labeled links for Today, Projects, and Knowledge; persistent lower
  section for How we decide, Settings, Theme, and Sign out.
- Mobile: minimal top strip (logo + theme), bottom tabs for the three primary
  destinations plus More.
- More opens a Browse sheet with How we decide, Settings, and Sign out.
- Settings hub prefixes still mark Settings active (`/settings`, `/schedule`,
  `/reports`, `/audit`, `/sources`).
- AppChrome lays out rail + content column; mobile content clears the bottom
  tab bar.

## Current repository state

- Branch: `feat/gemini-public-llm`, tracking
  `origin/feat/gemini-public-llm`.
- Uncommitted changes in `src/components/NavBar.tsx`,
  `src/components/AppChrome.tsx`, `src/styles/primitives.css`,
  `src/components/auth/SignOutControl.tsx` (earlier), and this handoff.

## Unresolved verified issues

- Visual review still needed in the browser (desktop floating sidebar +
  mobile tabs/More).

## Relevant changed files

- `src/components/NavBar.tsx`
- `src/components/AppChrome.tsx`
- `src/styles/primitives.css`
- `docs/agent-handoffs/next-chat.md`

## Test results

- `npx eslint src/components/NavBar.tsx src/components/AppChrome.tsx` passed.
- `npm run check:css` passed.
- `npx tsc --noEmit` remains blocked by pre-existing test-file errors
  (`TS5097` imports and outdated test fixtures); no edited file has IDE lint
  errors.

## Exact next task

Visually review floating expanded navigation in the running app (desktop and mobile
widths), then apply only review-driven polish — no IA changes unless the user
rejects the concept.

## Scope exclusions

- Do not redesign page bodies, footer, or auth.
- Do not change routes, connectors, task model, or LLM behavior.
- Do not add project-management, team, social, or analytics features.

## Acceptance criteria

1. Desktop uses a floating expanded sidebar; primary destinations are not
   topbar pills.
2. Mobile uses bottom tabs with a More Browse sheet for secondary destinations.
3. Today remains the home / dominant daily view.
4. Every previous nav destination remains reachable.
5. Settings hub routes still highlight Settings.
6. Sign out is always visible in the desktop sidebar and in the mobile More
   sheet.

## Required input documents

- `src/components/NavBar.tsx`
- `src/components/AppChrome.tsx`
- `docs/agent-handoffs/next-chat.md`
