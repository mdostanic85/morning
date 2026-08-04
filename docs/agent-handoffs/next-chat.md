# Next chat handoff — Gemini public LLM path (done)

## Completed work

### Phase 1 — LLM audit (read-only)

- **Providers before this change:** Groq (primary text), OpenAI (chat + embeddings), Anthropic (fallback), local OpenAI-compatible. No Google Gemini.
- **SDKs:** none — thin `fetch` adapters under `src/lib/llm/`.
- **Central router:** `src/lib/llm/router.ts` (`runLlmJob` / `runEmbeddingJob`).
- **Keys:** `GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LOCAL_LLM_*`, plus `data/secrets.json`. No `.env.example` existed.
- **Models:** Groq `openai/gpt-oss-120b` / `-20b` / `qwen/qwen3.6-27b`; OpenAI `gpt-4.1` / `gpt-4.1-mini` / `text-embedding-3-small`; Anthropic `claude-3-7-sonnet-latest`.
- **Architecture:** non-streaming; JSON via Zod + provider JSON schema; telemetry stores hashes and token counts, never prompts; no PUBLIC/PRIVATE split — every job sends personal work content to a cloud model.
- **Name collision:** "Gemini" in the Gmail/Drive connectors means meeting notes, and "google" means the OAuth connection.

### Phase 2 — Gemini implementation

- `src/lib/llm/gemini.ts` — REST `generateContent` adapter. System prompt goes to `systemInstruction`, JSON mode via `responseMimeType` (no `responseSchema`, since Zod's JSON Schema carries keywords Gemini rejects), usage read from `usageMetadata`, 429/`RESOURCE_EXHAUSTED` mapped to `rate_limit_daily`. The key travels in the `x-goog-api-key` header instead of `?key=` so it stays out of URLs and logs.
- Provider id is `gemini` (not `google`) because `google` already means the Gmail/Calendar/Drive OAuth connection. Env var is still `GOOGLE_API_KEY`.
- `public_research` job: `src/lib/llm/prompts/publicResearch.ts`, service `src/lib/research/publicResearch.ts`, route `POST /api/research/public`. Returns a summary plus key points, each with a verbatim quote, and an `unclear` list.
- Job is pinned: no fallbacks and no local append (`PROVIDER_PINNED_JOBS` in the router), so it fails with a clear message rather than moving bulk reading onto a paid provider.
- Gemini appears in no other job's model chain, so it never receives ingested personal content.
- `.env.example` created (`!.env.example` added to `.gitignore`), README documents the public path and the AI Studio key.
- Settings "Model keys" tab shows Google Gemini automatically via `CLOUD_LLM_PROVIDERS`.

## Current repository state

- Branch: `feat/gemini-public-llm`, two commits ahead of `main` (`2be5db7`)
  - `90b6ee6` audit handoff
  - `d89128a` Gemini implementation
- Not pushed, no PR opened
- Unrelated untracked file left alone: `docs/org/Ko-je-ko-u-firmi.pdf`

## Unresolved verified issues

- `npm run test:jul20-brief` fails 2 of 8 tests (`claim-aware ranking prefers new UATL-376 assignment…`, `composer builds DailyBriefV2 matching Jul 20 target decisions`). **Pre-existing** — reproduced on `main` with the Gemini work stashed. Untouched here.
- `llm_telemetry.estimated_cost_usd` is null for `gemini-3.1-flash-lite`, same as the Groq models: `src/services/llmTelemetry.ts` deliberately records null rather than a guessed price.
- `docs/current-app-architecture.md` still describes the pre-Gemini provider set and older model IDs. It was already stale before this change.

## Relevant changed files

```
src/lib/llm/gemini.ts                      (new)
src/lib/llm/gemini.test.mts                (new)
src/lib/llm/prompts/publicResearch.ts      (new)
src/lib/research/publicResearch.ts         (new)
src/app/api/research/public/route.ts       (new)
src/lib/llm/router.ts                      client, pinned job, MODEL_CONFIG entry
src/lib/llm/types.ts                       "gemini" provider, "public_research" job
src/lib/llm/modelCapabilities.ts           gemini reports no vision
src/services/settings.ts                   GOOGLE_API_KEY, cloud provider list
src/components/ApiKeyForm.tsx              label, key URL, hint
.env.example / .gitignore / README.md      env + docs
package.json                               test:gemini script
```

## Test results

- `npm run test:gemini` — 8/8 pass (mocked `fetch`: systemInstruction mapping, JSON mode, model override, header-not-URL key, multi-part concat + usage, empty response, blocked prompt, quota mapping)
- `npm test` — all suites pass except the pre-existing `test:jul20-brief` failures noted above
- `npm run lint` — 0 errors (13 pre-existing warnings elsewhere), CSS check passes
- `npx tsc --noEmit` — no errors in any changed file
- End-to-end smoke with a stubbed `fetch`: `[llm] public_research via gemini/gemini-3.1-flash-lite — ok · 420 in / 88 out`, schema validated, telemetry row written

## Exact next task

Decide whether Gemini should take over any job that reads the user's own work content, and if so make it primary with Groq as fallback. This reverses the public-only boundary shipped in `d89128a`, so it needs its own phase.

### Verified model facts (checked 2026-08-04)

| | `openai/gpt-oss-120b` (Groq) | `gemini-3.1-flash-lite` |
|---|---|---|
| Input / 1M | $0.15 | $0.25 |
| Output / 1M | $0.60 | $1.50 |
| Context | 131,072 total (input + output share it) | 1,048,576 in / 65,536 out |
| Image + PDF input | no | yes |
| Free tier used to train Google's products | n/a | **yes** (paid tier: no) |

Sources: https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite

Consequences: Gemini is **not** the cheaper option per token, and Groq keeps the latency lead, so a blanket primary swap costs more and buys nothing on speed. A free-tier `GOOGLE_API_KEY` means Google trains on the user's transcripts and mail, so billing must be enabled before any personal-content job moves.

### Where Gemini genuinely wins

1. **Vision — `delivery_sync_review`** (today Groq `qwen/qwen3.6-27b`, a thinking model whose hidden reasoning shares the 8192 budget). Gemini takes images and PDFs natively. **Not a config flip**: `src/lib/llm/gemini.ts` is deliberately text-only because the app only holds image URLs, and Gemini needs inline bytes or a Files API URI. `modelCapabilities.ts` must stop reporting no-vision for `gemini` once that lands.
2. **Long, multilingual reading** — 1M input vs Groq's 131k shared window matters for `task_qa`, `hydra_report`, `priority_planning` with large evidence bundles. Sources here are mixed Serbian/English while universal rule 9 requires authored output in English with verbatim quotes preserved; Google positions Flash-Lite for high-volume translation, where the gpt-oss family is weaker.

### Where Groq should stay primary

`task_reflect`, `daily_memory`, `knowledge_qa` — narrow, cheap passes where latency beats quality.

### Open decisions for the user

- Is billing enabled on the Google key? If not, stop: no personal content may go to the free tier.
- Which scope: vision only, the long/multilingual reading jobs, or all text jobs?
- If any personal-content job moves, the public-only claims in `README.md`, `src/lib/llm/gemini.ts`, `src/lib/llm/router.ts` (`PROVIDER_PINNED_JOBS`, the `public_research` comment), `src/lib/research/publicResearch.ts`, and `src/components/ApiKeyForm.tsx` all become wrong and must be rewritten in the same change.
- Also still open from the previous phase: verify against the live API with a real key, and decide whether the public path deserves a UI surface.

## Scope exclusions

- No Anthropic/Claude work was added, and no existing job changed provider.
- No UI beyond the Settings key row: the public path has no screen yet.
- The pre-existing jul20 brief failures and the stale architecture doc were left as found.
- No Google SDK dependency added.

## Acceptance criteria met

1. Audit written before coding, and its recommendation followed (new adapter behind the existing router, private jobs untouched).
2. Gemini client matches the required REST contract.
3. `.env.example` plus README documentation with the AI Studio key link.
4. A real call path (`POST /api/research/public`), not a stub.
5. Unit test mocking `fetch`, wired into `npm test`.
6. Diff limited to Gemini wiring.
