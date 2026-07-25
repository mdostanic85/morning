import type { z } from "zod";

// The full set of AI-powered jobs the app can run. Every feature that needs
// a model call adds a case here and a model mapping in router.ts — it never
// calls a provider SDK/API directly (see architecture.mdc).
export const JOB_TYPES = [
  "task_extraction",
  "task_reflect",
  "project_matching",
  "project_discovery",
  "priority_planning",
  "today_briefing",
  "knowledge_extraction",
  "delivery_verification",
  "daily_memory",
  "knowledge_qa",
  "task_qa",
  "focus_action_plan",
  "figma_frame_discovery",
  "delivery_sync_review",
  "hydra_report",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const PROVIDERS = ["openai", "anthropic", "groq", "local"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface ModelConfig {
  provider: Provider;
  model: string;
  /** Default output token budget for this job (Groq/OpenAI). */
  maxTokens?: number;
  /** Tried in order when the primary provider has no key or the call fails. */
  fallbacks?: ModelConfig[];
}

// What a provider adapter needs to make one completion call. Provider
// modules are pure API clients — they don't know about jobs, settings, or
// where the API key came from, which keeps them independently swappable.
export interface CompletionRequest {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  /** JSON Schema sent to providers that support native Structured Outputs. */
  responseJsonSchema?: Record<string, unknown>;
  /** Visual evidence for providers that support multimodal input. */
  imageUrls?: string[];
}

export interface CompletionResponse {
  /** Raw text content from the model — the router is responsible for parsing/validating it. */
  text: string;
  /** Provider-reported usage, when available. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Unparsed provider response, kept for debugging/audit only. */
  raw: unknown;
}

export interface ProviderClient {
  provider: Provider;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

export const LLM_ERROR_KINDS = [
  "missing_api_key",
  "network_error",
  "provider_error",
  "rate_limit_daily",
  "invalid_json",
  "schema_validation_failed",
] as const;
export type LlmErrorKind = (typeof LLM_ERROR_KINDS)[number];

/** Thrown internally by provider adapters and the router; the router always converts these into a result, never lets them escape to callers. */
export class LlmError extends Error {
  kind: LlmErrorKind;
  cause?: unknown;

  constructor(kind: LlmErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "LlmError";
    this.kind = kind;
    this.cause = cause;
  }
}

export interface RunJobParams<T> {
  jobType: JobType;
  /** Defaults to the job's placeholder prompt in router.ts if omitted. */
  systemPrompt?: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
  /** Passed through only to multimodal-capable provider clients. */
  imageUrls?: string[];
}

export type LlmJobResult<T> =
  | {
      ok: true;
      jobType: JobType;
      provider: Provider;
      model: string;
      data: T;
    }
  | {
      ok: false;
      jobType: JobType;
      provider: Provider;
      model: string;
      kind: LlmErrorKind;
      error: string;
    };
