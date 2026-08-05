# Next chat handoff — fix assistant context overflow and send-button shape

## Completed work

- Added a provider-safe total context budget for task chat prompts
  (`TASK_CHAT_USER_PROMPT_BUDGET = 72_000` chars) in
  `src/lib/llm/prompts/taskQa.ts`, with per-source / per-knowledge clamps and
  lowest-priority drop-until-fit.
- Wired `src/lib/tasks/taskQa.ts` to the shared budget constants (source body
  cap 8k, max 60 sources, max 40 knowledge).
- Humanized context-overflow provider errors in `TaskChatPanel`.
- Made the 44×44 send control circular via `.chat-send` exception in
  `heroui.css` + local sizing in the CSS module.
- Fixed malformed brace structure in `TaskChatPanel.module.css`.
- Added focused tests: `src/lib/llm/prompts/taskQa.test.mts` (`npm run test:task-qa`).

## Current repository state

- Branch: `feat/gemini-public-llm`.
- Large pre-existing uncommitted working tree (unrelated ranking/brief/Jira
  work remains).
- This phase's files are also uncommitted.

## Unresolved verified issues

- None for this phase.

## Relevant changed files

- `src/lib/llm/prompts/taskQa.ts`
- `src/lib/llm/prompts/taskQa.test.mts`
- `src/lib/tasks/taskQa.ts`
- `src/components/TaskChatPanel.tsx`
- `src/components/TaskChatPanel.module.css`
- `src/styles/vendor/heroui.css`
- `package.json` (`test:task-qa`)

## Test results

- `npm run test:task-qa` — 4/4 pass
- ESLint on touched TS/TSX — pass
- `npm run check:css` — pass
- Full-project `tsc` still reports pre-existing errors in unrelated test files;
  none in the files touched for this phase

## Exact next task

Independent review of the task-chat context budget + circular send button, or
the next product priority the user chooses.

## Scope exclusions

- Ranking, daily brief, Jira assignment, extraction unchanged by design.
- No external write actions.

## Acceptance criteria (this phase)

1. A general question cannot construct a prompt larger than the configured
   task-chat context budget. ✅
2. Context-length provider failures show concise, actionable UI copy. ✅
3. The 44×44 send control renders as a circle in enabled and disabled states. ✅
4. The CSS module has valid brace structure. ✅
5. Focused tests, lint, and type checks for touched files pass. ✅

## Required input documents

- (none for a follow-up review beyond the files listed above)
