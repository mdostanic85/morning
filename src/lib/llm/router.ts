import "server-only";
import { getRawApiKey } from "@/services/settings";
import { openaiClient } from "./openai";
import { anthropicClient } from "./anthropic";
import { TASK_EXTRACTOR_SYSTEM_PROMPT } from "./prompts/taskExtractor";
import { PROJECT_MATCHER_SYSTEM_PROMPT } from "./prompts/projectMatcher";
import { PRIORITY_PLANNER_SYSTEM_PROMPT } from "./prompts/priorityPlanner";
import { KNOWLEDGE_EXTRACTOR_SYSTEM_PROMPT } from "./prompts/knowledgeExtractor";
import { DELIVERY_VERIFIER_SYSTEM_PROMPT } from "./prompts/deliveryVerifier";
import { DAILY_MEMORY_SYSTEM_PROMPT } from "./prompts/dailyMemory";
import {
  LlmError,
  type JobType,
  type LlmErrorKind,
  type LlmJobResult,
  type ModelConfig,
  type Provider,
  type ProviderClient,
  type RunJobParams,
} from "./types";

export * from "./types";

/**
 * The single place provider + model choice is configured for every job.
 * Change a job's model or move it to a different provider by editing this
 * table only — no other file should hardcode a model name.
 */
export const MODEL_CONFIG: Record<JobType, ModelConfig> = {
  // Cheap/fast, structured-output-friendly OpenAI model.
  task_extraction: { provider: "openai", model: "gpt-4.1-mini" },
  project_matching: { provider: "openai", model: "gpt-4.1-mini" },
  knowledge_extraction: { provider: "openai", model: "gpt-4.1-mini" },
  // Stronger OpenAI reasoning model — prioritization needs to weigh the whole queue.
  priority_planning: { provider: "openai", model: "gpt-4.1" },
  daily_memory: { provider: "openai", model: "gpt-4.1" },
  // Claude Sonnet by default for verification; swap to an Opus model id here
  // for harder cases without touching any calling code.
  delivery_verification: { provider: "anthropic", model: "claude-3-7-sonnet-latest" },
};

/**
 * Default system prompt per job, sourced from `./prompts/*`. A caller can
 * still override `systemPrompt` per call (e.g. to A/B a variant), but this
 * table is what every job uses unless told otherwise. The actual prompt
 * text, job-specific input builders, and output schemas live in the
 * dedicated module per job — this table only wires job -> prompt.
 */
export const JOB_SYSTEM_PROMPTS: Record<JobType, string> = {
  task_extraction: TASK_EXTRACTOR_SYSTEM_PROMPT,
  project_matching: PROJECT_MATCHER_SYSTEM_PROMPT,
  priority_planning: PRIORITY_PLANNER_SYSTEM_PROMPT,
  knowledge_extraction: KNOWLEDGE_EXTRACTOR_SYSTEM_PROMPT,
  delivery_verification: DELIVERY_VERIFIER_SYSTEM_PROMPT,
  daily_memory: DAILY_MEMORY_SYSTEM_PROMPT,
};

function getProviderClient(provider: Provider): ProviderClient {
  switch (provider) {
    case "openai":
      return openaiClient;
    case "anthropic":
      return anthropicClient;
  }
}

const ENV_VAR_HINT: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

function tryParseJson(text: string): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid JSON." };
  }
}

/** Retries transient failures (network/provider errors) with a short backoff. Never retries validation failures here — that's handled by the caller with a corrective prompt. */
async function withTransientRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof LlmError && err.kind !== "missing_api_key";
      if (!retryable || i === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * (i + 1)));
    }
  }
  throw lastErr;
}

function logJobEvent(event: {
  jobType: JobType;
  provider: Provider;
  model: string;
  ok: boolean;
  kind?: string;
  durationMs: number;
}) {
  // Minimal audit trail. Deliberately logs metadata only — never prompt or
  // response content — to avoid leaking source material into logs.
  const status = event.ok ? "ok" : `failed (${event.kind})`;
  console.info(
    `[llm] ${event.jobType} via ${event.provider}/${event.model} — ${status} in ${event.durationMs}ms`
  );
}

/**
 * Runs a single LLM job end-to-end: resolves the API key, calls the
 * configured provider/model, parses the response as JSON, and validates it
 * against the caller's schema. On invalid JSON or a schema mismatch, retries
 * once with the error fed back to the model. Never throws — every failure
 * mode is returned as a structured `LlmJobResult`.
 */
export async function runLlmJob<T>(params: RunJobParams<T>): Promise<LlmJobResult<T>> {
  const { jobType, schema } = params;
  const { provider, model } = MODEL_CONFIG[jobType];
  const systemPrompt = params.systemPrompt ?? JOB_SYSTEM_PROMPTS[jobType];
  const client = getProviderClient(provider);
  const startedAt = Date.now();

  function fail(kind: LlmErrorKind, error: string): LlmJobResult<T> {
    logJobEvent({ jobType, provider, model, ok: false, kind, durationMs: Date.now() - startedAt });
    return { ok: false, jobType, provider, model, kind, error };
  }

  const apiKey = await getRawApiKey(provider);
  if (!apiKey) {
    return fail(
      "missing_api_key",
      `No API key configured for ${provider}. Set ${ENV_VAR_HINT[provider]} or add a key in Settings.`
    );
  }

  let userPrompt = params.userPrompt;
  const maxAttempts = 2; // 1 initial attempt + 1 corrective retry on invalid output

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let completion;
    try {
      completion = await withTransientRetry(() =>
        client.complete({
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
        })
      );
    } catch (err) {
      if (err instanceof LlmError) {
        return fail(err.kind, err.message);
      }
      return fail("provider_error", err instanceof Error ? err.message : "Unknown provider error.");
    }

    const parsed = tryParseJson(completion.text);
    if (!parsed.ok) {
      if (attempt < maxAttempts - 1) {
        userPrompt = `${params.userPrompt}\n\nYour previous response could not be parsed as JSON (${parsed.error}). Reply again with ONLY valid JSON — no commentary, no markdown fences.`;
        continue;
      }
      return fail("invalid_json", parsed.error);
    }

    const validated = schema.safeParse(parsed.data);
    if (!validated.success) {
      if (attempt < maxAttempts - 1) {
        userPrompt = `${params.userPrompt}\n\nYour previous JSON response did not match the required schema: ${validated.error.message}. Reply again with ONLY valid JSON matching the schema.`;
        continue;
      }
      return fail("schema_validation_failed", validated.error.message);
    }

    logJobEvent({ jobType, provider, model, ok: true, durationMs: Date.now() - startedAt });
    return { ok: true, jobType, provider, model, data: validated.data };
  }

  // Unreachable — the loop always returns — but keeps TypeScript satisfied.
  return fail("provider_error", "Job did not complete.");
}
