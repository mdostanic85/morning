# Next chat handoff — Add Google Gemini (Phase 2)

## Completed work (Phase 1)

Read-only LLM audit of Worklight/Morning. No code changes.

### Inventory

- **Providers:** Groq (primary text), OpenAI (chat + embeddings), Anthropic (fallback), local OpenAI-compatible. **No Google Gemini Generative Language API.**
- **SDKs:** None. Thin `fetch` adapters under `src/lib/llm/`.
- **Central router:** `src/lib/llm/router.ts` (`runLlmJob` / `runEmbeddingJob`). Required by architecture rules.
- **Env keys:** `GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LOCAL_LLM_*`. Secrets also in `data/secrets.json`. No `.env.example`.
- **Models (current):** Groq `openai/gpt-oss-120b` / `openai/gpt-oss-20b` / `qwen/qwen3.6-27b`; OpenAI `gpt-4.1` / `gpt-4.1-mini` / `text-embedding-3-small`; Anthropic `claude-3-7-sonnet-latest`.
- **Name collision:** “Gemini” in connectors = Google Meet/Drive **meeting notes**, not Google AI.

### Architecture notes

- Non-streaming; structured JSON via Zod + provider JSON schema.
- Telemetry: `llm_telemetry` (hashes + tokens/cost; no raw prompts).
- No PUBLIC vs PRIVATE provider split today — almost all jobs send personal work content (email, transcripts, Jira, knowledge) to cloud LLMs.
- Settings: `src/services/settings.ts` — `CLOUD_LLM_PROVIDERS = ["groq","openai","anthropic"]`.

### Recommendation (for Phase 2)

1. Add `src/lib/llm/google.ts` (or `gemini.ts`) as a `ProviderClient` like `anthropic.ts` — REST `generateContent`, no official SDK.
2. Extend `PROVIDERS` / settings / router; env `GOOGLE_API_KEY`; model `PUBLIC_LLM_MODEL ?? "gemini-3.1-flash-lite"`.
3. **Do not move** existing jobs (extraction, QA, briefing, Hydra, etc.) to Gemini — they carry PII / personal docs.
4. Prefer a **new public-only job or clearly marked stub** wired through the router, not a blind primary swap.
5. Keep Groq/OpenAI/Anthropic paths for private writing; do not add/change Anthropic as part of this task beyond plumbing types if needed.

## Current repository state

- Branch: `main` @ `2be5db7` (tracks `origin/main`)
- Unrelated untracked: `docs/org/Ko-je-ko-u-firmi.pdf`
- No Phase 2 code yet

## Unresolved verified issues

- None from this audit (docs in `docs/current-app-architecture.md` are partly stale on model IDs — out of scope unless touched)

## Relevant files for Phase 2

- `src/lib/llm/types.ts` — add `"google"` (or `"gemini"`) to `PROVIDERS`
- `src/lib/llm/anthropic.ts` — pattern to mirror (fetch + `LlmError` + usage)
- `src/lib/llm/router.ts` — register client + optional public job config
- `src/services/settings.ts` — `GOOGLE_API_KEY`, cloud provider list, secrets
- `src/services/llmTelemetry.ts` — optional cost row for Gemini model
- `README.md` — key from https://aistudio.google.com/apikey
- Tests: `src/lib/llm/*.test.mts` pattern (mock `fetch`)

## Test results

- Phase 1 was read-only; no tests run for Gemini yet

## Exact next task

Implement Google Gemini Generative Language API as a thin REST provider behind the existing LLM router, for PUBLIC/non-PII workloads only (`gemini-3.1-flash-lite` via `GOOGLE_API_KEY` / optional `PUBLIC_LLM_MODEL`), with env docs, one real public call path or marked stub, and a minimal mocked-fetch unit test.

## Scope exclusions

- Do **not** add or expand Anthropic/Claude.
- Do **not** migrate private jobs (task extraction, QA, email/transcript content, knowledge, Hydra) to Gemini.
- Do **not** unrelated refactors or UI settings sprawl unless required for key storage consistency.
- Do **not** use Google’s official SDK unless the repo already depends on it (it does not).

## Acceptance criteria

1. Phase 1 findings respected (central router; fetch adapter; secrets server-side).
2. Working Gemini client matching Optra-style REST contract (`systemInstruction`, role map, JSON mime type, usageMetadata).
3. `.env.example` (create if missing) + README note for AI Studio key.
4. At least one PUBLIC call path or clearly marked stub through the router.
5. Minimal unit test mocking `fetch`.
6. Focused diff only.

## Required input documents

- This handoff
- User Phase 2 prompt (Gemini REST contract + Optra defaults)
- Reference shape: Optra `src/lib/ai/google.ts` / `routing.ts` (not in this repo — adapt to `src/lib/llm/`)
