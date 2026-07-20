import "server-only";
import { z } from "zod";
import { getActiveProviders, getAvailableApiKey } from "@/services/settings";
import { openaiClient, openaiEmbed } from "./openai";
import { anthropicClient } from "./anthropic";
import { groqClient } from "./groq";
import { TASK_EXTRACTOR_SYSTEM_PROMPT } from "./prompts/taskExtractor";
import { PROJECT_MATCHER_SYSTEM_PROMPT } from "./prompts/projectMatcher";
import { PROJECT_DISCOVERY_SYSTEM_PROMPT } from "./prompts/projectDiscovery";
import { PRIORITY_PLANNER_SYSTEM_PROMPT } from "./prompts/priorityPlanner";
import { TODAY_BRIEFING_SYSTEM_PROMPT } from "./prompts/todayBriefing";
import { KNOWLEDGE_EXTRACTOR_SYSTEM_PROMPT } from "./prompts/knowledgeExtractor";
import { DELIVERY_VERIFIER_SYSTEM_PROMPT } from "./prompts/deliveryVerifier";
import { DAILY_MEMORY_SYSTEM_PROMPT } from "./prompts/dailyMemory";
import { KNOWLEDGE_QA_SYSTEM_PROMPT } from "./prompts/knowledgeQa";
import { TASK_QA_SYSTEM_PROMPT } from "./prompts/taskQa";
import { FOCUS_ACTION_PLAN_SYSTEM_PROMPT } from "./prompts/focusActionPlan";
import { FIGMA_FRAME_DISCOVERY_SYSTEM_PROMPT } from "./prompts/figmaFrameDiscovery";
import { DELIVERY_SYNC_REVIEW_SYSTEM_PROMPT } from "./prompts/deliverySyncReview";
import { HYDRA_REPORT_SYSTEM_PROMPT } from "./prompts/hydraReport";
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

const GROQ_70B = "llama-3.3-70b-versatile";
const GROQ_8B = "llama-3.1-8b-instant";
const OPENAI_MINI = "gpt-4.1-mini";
const OPENAI_FULL = "gpt-4.1";
const ANTHROPIC_SONNET = "claude-3-7-sonnet-latest";

/** Groq 8b when 70b hits rate limits; then paid fallbacks only if configured. */
const GROQ_8B_FALLBACK: ModelConfig = {
  provider: "groq",
  model: GROQ_8B,
  maxTokens: 4096,
};

const ANTHROPIC_FALLBACK: ModelConfig = {
  provider: "anthropic",
  model: ANTHROPIC_SONNET,
  maxTokens: 4096,
};

const OPENAI_MINI_FALLBACK: ModelConfig = {
  provider: "openai",
  model: OPENAI_MINI,
  maxTokens: 4096,
};

const OPENAI_FULL_FALLBACK: ModelConfig = {
  provider: "openai",
  model: OPENAI_FULL,
  maxTokens: 4096,
};

const STANDARD_TEXT_FALLBACKS: ModelConfig[] = [
  GROQ_8B_FALLBACK,
  ANTHROPIC_FALLBACK,
  OPENAI_MINI_FALLBACK,
];

const HEAVY_TEXT_FALLBACKS: ModelConfig[] = [
  { ...GROQ_8B_FALLBACK, maxTokens: 4096 },
  { ...ANTHROPIC_FALLBACK, maxTokens: 4096 },
  OPENAI_FULL_FALLBACK,
];

/**
 * Groq-first for every text job (70b → 8b), then Anthropic/OpenAI only when active.
 * Inactive providers are never attempted — if only Groq is on, all text jobs stay on Groq.
 * OpenAI is also used for embeddings only when enabled. Jira projects sync from MCP.
 */
export const MODEL_CONFIG: Record<JobType, ModelConfig> = {
  task_extraction: {
    provider: "groq",
    model: GROQ_70B,
    maxTokens: 4096,
    fallbacks: STANDARD_TEXT_FALLBACKS,
  },
  project_matching: {
    provider: "groq",
    model: GROQ_70B,
    maxTokens: 2048,
    fallbacks: STANDARD_TEXT_FALLBACKS,
  },
  project_discovery: {
    provider: "groq",
    model: GROQ_70B,
    maxTokens: 4096,
    fallbacks: HEAVY_TEXT_FALLBACKS,
  },
  knowledge_extraction: {
    provider: "groq",
    model: GROQ_70B,
    maxTokens: 4096,
    fallbacks: STANDARD_TEXT_FALLBACKS,
  },
  knowledge_qa: {
    provider: "groq",
    model: GROQ_70B,
    maxTokens: 2048,
    fallbacks: STANDARD_TEXT_FALLBACKS,
  },
  task_qa: {
    provider: "openai",
    model: "gpt-5.4",
    maxTokens: 4096,
  },
  priority_planning: {
    provider: "groq",
    model: GROQ_70B,
    maxTokens: 4096,
    fallbacks: HEAVY_TEXT_FALLBACKS,
  },
  today_briefing: {
    provider: "groq",
    model: GROQ_70B,
    maxTokens: 4096,
    fallbacks: HEAVY_TEXT_FALLBACKS,
  },
  daily_memory: {
    provider: "groq",
    model: GROQ_70B,
    maxTokens: 2048,
    fallbacks: [
      { ...GROQ_8B_FALLBACK, maxTokens: 2048 },
      { ...ANTHROPIC_FALLBACK, maxTokens: 2048 },
      { ...OPENAI_FULL_FALLBACK, maxTokens: 2048 },
    ],
  },
  delivery_verification: {
    provider: "groq",
    model: GROQ_70B,
    maxTokens: 2048,
    fallbacks: [
      { ...GROQ_8B_FALLBACK, maxTokens: 2048 },
      { ...ANTHROPIC_FALLBACK, maxTokens: 2048 },
    ],
  },
  focus_action_plan: {
    provider: "groq",
    model: GROQ_70B,
    maxTokens: 4096,
    fallbacks: HEAVY_TEXT_FALLBACKS,
  },
  figma_frame_discovery: {
    provider: "openai",
    model: OPENAI_FULL,
    maxTokens: 2048,
  },
  delivery_sync_review: {
    provider: "openai",
    model: "gpt-5.4",
    maxTokens: 4096,
    fallbacks: [
      { provider: "anthropic", model: ANTHROPIC_SONNET, maxTokens: 4096 },
      { provider: "openai", model: OPENAI_FULL, maxTokens: 3072 },
    ],
  },
  hydra_report: {
    provider: "openai",
    model: OPENAI_FULL,
    maxTokens: 6144,
    fallbacks: [
      OPENAI_MINI_FALLBACK,
      { provider: "groq", model: GROQ_70B, maxTokens: 6144 },
      { ...ANTHROPIC_FALLBACK, maxTokens: 6144 },
    ],
  },
};

/** Embeddings stay on OpenAI — Groq has no embeddings API. */
export const EMBEDDING_MODEL_CONFIG: ModelConfig = {
  provider: "openai",
  model: "text-embedding-3-small",
};

export const JOB_SYSTEM_PROMPTS: Record<JobType, string> = {
  task_extraction: TASK_EXTRACTOR_SYSTEM_PROMPT,
  project_matching: PROJECT_MATCHER_SYSTEM_PROMPT,
  project_discovery: PROJECT_DISCOVERY_SYSTEM_PROMPT,
  priority_planning: PRIORITY_PLANNER_SYSTEM_PROMPT,
  today_briefing: TODAY_BRIEFING_SYSTEM_PROMPT,
  knowledge_extraction: KNOWLEDGE_EXTRACTOR_SYSTEM_PROMPT,
  delivery_verification: DELIVERY_VERIFIER_SYSTEM_PROMPT,
  daily_memory: DAILY_MEMORY_SYSTEM_PROMPT,
  knowledge_qa: KNOWLEDGE_QA_SYSTEM_PROMPT,
  task_qa: TASK_QA_SYSTEM_PROMPT,
  focus_action_plan: FOCUS_ACTION_PLAN_SYSTEM_PROMPT,
  figma_frame_discovery: FIGMA_FRAME_DISCOVERY_SYSTEM_PROMPT,
  delivery_sync_review: DELIVERY_SYNC_REVIEW_SYSTEM_PROMPT,
  hydra_report: HYDRA_REPORT_SYSTEM_PROMPT,
};

function getProviderClient(provider: Provider): ProviderClient {
  switch (provider) {
    case "openai":
      return openaiClient;
    case "anthropic":
      return anthropicClient;
    case "groq":
      return groqClient;
  }
}

const ENV_VAR_HINT: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
};

function flattenModelChain(primary: ModelConfig): ModelConfig[] {
  return [primary, ...(primary.fallbacks ?? [])];
}

async function configsForJob(jobType: JobType): Promise<ModelConfig[]> {
  const active = new Set(await getActiveProviders());
  if (active.size === 0) return [];

  const chain = flattenModelChain(MODEL_CONFIG[jobType]);
  return chain.filter((config) => active.has(config.provider));
}

/**
 * OpenAI/Groq strict structured outputs reject JSON Schema "format" annotations
 * (e.g. "uri" from z.string().url()). Strip them — Zod still validates the
 * parsed response locally, so nothing is lost.
 */
function sanitizeJsonSchemaForProviders(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeJsonSchemaForProviders);
  if (node && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "format" && typeof value === "string") continue;
      result[key] = sanitizeJsonSchemaForProviders(value);
    }
    return result;
  }
  return node;
}

function tryParseJson(text: string): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid JSON." };
  }
}

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
  jobType: JobType | "embedding";
  provider: Provider;
  model: string;
  ok: boolean;
  kind?: string;
  error?: string;
  durationMs: number;
  fallback?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}) {
  const status = event.ok ? "ok" : `failed (${event.kind})`;
  const via = event.fallback ? " (fallback)" : "";
  const usage = event.usage
    ? ` · ${event.usage.inputTokens} in / ${event.usage.outputTokens} out`
    : "";
  const error = event.error ? ` — ${event.error.slice(0, 300)}` : "";
  console.info(
    `[llm] ${event.jobType} via ${event.provider}/${event.model}${via} — ${status} in ${event.durationMs}ms${usage}${error}`
  );
}

function shouldTryFallback(kind: LlmErrorKind): boolean {
  return (
    kind === "missing_api_key" ||
    kind === "provider_error" ||
    kind === "rate_limit_daily" ||
    kind === "network_error" ||
    kind === "invalid_json" ||
    kind === "schema_validation_failed"
  );
}

function shouldSkipProvider(failedKind: LlmErrorKind, failedProvider: Provider, nextProvider: Provider): boolean {
  // Daily org-level rate limit — skip remaining configs on the same provider
  return failedKind === "rate_limit_daily" && nextProvider === failedProvider;
}

async function runWithConfig<T>(
  jobType: JobType,
  config: ModelConfig,
  params: RunJobParams<T>,
  startedAt: number,
  isFallback: boolean
): Promise<LlmJobResult<T>> {
  const { schema } = params;
  const { provider, model } = config;
  const systemPrompt = params.systemPrompt ?? JOB_SYSTEM_PROMPTS[jobType];
  const client = getProviderClient(provider);
  const maxTokens = params.maxTokens ?? config.maxTokens ?? 4096;

  function fail(kind: LlmErrorKind, error: string): LlmJobResult<T> {
    logJobEvent({
      jobType,
      provider,
      model,
      ok: false,
      kind,
      error,
      durationMs: Date.now() - startedAt,
      fallback: isFallback,
    });
    return { ok: false, jobType, provider, model, kind, error };
  }

  const apiKey = await getAvailableApiKey(provider);
  if (!apiKey) {
    return fail(
      "missing_api_key",
      `No API key available for ${provider}. Add a key in Settings, enable the provider, or set ${ENV_VAR_HINT[provider]}.`
    );
  }

  let userPrompt = params.userPrompt;
  const maxAttempts = 2;

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
          maxTokens,
          responseJsonSchema: sanitizeJsonSchemaForProviders(
            z.toJSONSchema(schema, { io: "output" })
          ) as Record<string, unknown>,
          imageUrls: params.imageUrls,
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

    logJobEvent({
      jobType,
      provider,
      model,
      ok: true,
      durationMs: Date.now() - startedAt,
      fallback: isFallback,
      usage: completion.usage,
    });
    return { ok: true, jobType, provider, model, data: validated.data };
  }

  return fail("provider_error", "Job did not complete.");
}

export async function runLlmJob<T>(params: RunJobParams<T>): Promise<LlmJobResult<T>> {
  const { jobType } = params;
  const startedAt = Date.now();
  const configs = await configsForJob(jobType);

  if (configs.length === 0) {
    return {
      ok: false,
      jobType,
      provider: MODEL_CONFIG[jobType].provider,
      model: MODEL_CONFIG[jobType].model,
      kind: "missing_api_key",
      error: "No active LLM providers. Turn on at least one provider in Settings.",
    };
  }

  let primaryFailure: LlmJobResult<T> | null = null;
  let lastResult: LlmJobResult<T> | null = null;

  for (let index = 0; index < configs.length; index++) {
    const config = configs[index];
    const isFallback = index > 0;

    // Skip configs on the same provider when a daily rate limit was hit
    if (index > 0 && lastResult && shouldSkipProvider(lastResult.kind, lastResult.provider, config.provider)) {
      continue;
    }

    const result = await runWithConfig(jobType, config, params, startedAt, isFallback);
    if (result.ok) return result;

    if (index === 0) primaryFailure = result;
    lastResult = result;
    const hasNext = index < configs.length - 1;
    if (!hasNext || !shouldTryFallback(result.kind)) {
      return primaryFailure ?? result;
    }
  }

  return (
    primaryFailure ??
    lastResult ?? {
      ok: false,
      jobType,
      provider: configs[0].provider,
      model: configs[0].model,
      kind: "provider_error",
      error: "Job did not complete.",
    }
  );
}

export type EmbeddingJobResult =
  | { ok: true; model: string; vectors: number[][] }
  | { ok: false; model: string; kind: LlmErrorKind; error: string };

let embeddingsUnavailableReason: string | null = null;

export async function runEmbeddingJob(texts: string[]): Promise<EmbeddingJobResult> {
  const { provider, model } = EMBEDDING_MODEL_CONFIG;
  const startedAt = Date.now();

  if (texts.length === 0) {
    return { ok: true, model, vectors: [] };
  }

  const active = await getActiveProviders();
  if (!active.includes("openai")) {
    return {
      ok: false,
      model,
      kind: "missing_api_key",
      error:
        active.length === 1 && active[0] === "groq"
          ? "Knowledge search needs OpenAI embeddings. Groq-only mode covers text jobs; enable OpenAI for search."
          : "OpenAI is off. Enable it in Settings for knowledge search embeddings.",
    };
  }

  if (embeddingsUnavailableReason) {
    return {
      ok: false,
      model,
      kind: "provider_error",
      error: embeddingsUnavailableReason,
    };
  }

  function fail(kind: LlmErrorKind, error: string): EmbeddingJobResult {
    logJobEvent({
      jobType: "embedding",
      provider,
      model,
      ok: false,
      kind,
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, model, kind, error };
  }

  const apiKey = await getAvailableApiKey(provider);
  if (!apiKey) {
    return fail(
      "missing_api_key",
      `No API key available for ${provider}. Add a key in Settings, enable the provider, or set ${ENV_VAR_HINT[provider]}.`
    );
  }

  try {
    const vectors = await withTransientRetry(() => openaiEmbed({ apiKey, model, texts }));
    logJobEvent({
      jobType: "embedding",
      provider,
      model,
      ok: true,
      durationMs: Date.now() - startedAt,
    });
    return { ok: true, model, vectors };
  } catch (err) {
    if (err instanceof LlmError) {
      const message =
        err.kind === "provider_error"
          ? `OpenAI embeddings unavailable (${err.message}). Knowledge search will not work until OpenAI billing is restored or a new key is added.`
          : err.message;
      if (err.kind === "provider_error" || err.kind === "missing_api_key") {
        embeddingsUnavailableReason = message;
      }
      return fail(err.kind, message);
    }
    const message = err instanceof Error ? err.message : "Unknown provider error.";
    embeddingsUnavailableReason = `OpenAI embeddings unavailable (${message}). Knowledge search will not work until OpenAI billing is restored or a new key is added.`;
    return fail("provider_error", embeddingsUnavailableReason);
  }
}
