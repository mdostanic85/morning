import "server-only";
import {
  LlmError,
  type CompletionRequest,
  type CompletionResponse,
  type Provider,
  type ProviderClient,
} from "./types";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RATE_LIMIT_WAIT_MS = 30_000;

interface OpenAiChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

interface OpenAiEmbeddingsResponse {
  data?: { embedding?: number[] }[];
  error?: { message?: string };
}

function parseRateLimitWaitMs(message: string): number | null {
  const secondsMatch = message.match(/try again in ([0-9.]+)s/i);
  if (secondsMatch) {
    return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.ceil(parseFloat(secondsMatch[1]) * 1000));
  }

  const minutesMatch = message.match(/try again in (?:(\d+)m)?([0-9.]+)?s/i);
  if (minutesMatch) {
    const minutes = minutesMatch[1] ? parseInt(minutesMatch[1], 10) : 0;
    const seconds = minutesMatch[2] ? parseFloat(minutesMatch[2]) : 0;
    const totalMs = (minutes * 60 + seconds) * 1000;
    if (totalMs > 0 && totalMs <= MAX_RATE_LIMIT_WAIT_MS) {
      return Math.ceil(totalMs);
    }
  }

  return null;
}

function isDailyRateLimit(message: string): boolean {
  return /tokens per day|TPD/i.test(message);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OpenAiCompatibleConfig {
  provider: Provider;
  chatCompletionsUrl: string;
  embeddingsUrl?: string;
  /** When false, skips response_format json_object (e.g. some local models). */
  jsonMode?: boolean;
  /** Use the provider's native JSON Schema contract when one is supplied. */
  structuredOutputs?: boolean;
  /** Controls hidden reasoning on compatible thinking models. */
  reasoningEffort?: "none" | "low" | "medium" | "high";
  label: string;
  requestTimeoutMs?: number;
}

function everyObjectFieldIsRequired(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(everyObjectFieldIsRequired);
  if (!node || typeof node !== "object") return true;

  const record = node as Record<string, unknown>;
  if (record.type === "object" || record.properties) {
    const properties =
      record.properties && typeof record.properties === "object"
        ? (record.properties as Record<string, unknown>)
        : {};
    const required = new Set(Array.isArray(record.required) ? record.required : []);
    if (
      record.additionalProperties !== false ||
      Object.keys(properties).some((key) => !required.has(key))
    ) {
      return false;
    }
  }

  return Object.values(record).every(everyObjectFieldIsRequired);
}

/**
 * Groq only accepts `response_format: json_schema` on a subset of models
 * (the GPT-OSS family). Others — notably the Qwen 3.x vision model used for
 * Figma delivery audits — return a hard 400 for `json_schema` and must use
 * `json_object`. Sending the wrong format silently kills the whole job, so we
 * gate schema mode per model rather than per provider.
 */
export function groqModelSupportsJsonSchema(model: string): boolean {
  return /gpt-oss/i.test(model);
}

/** Groq "thinking" models (Qwen 3.x) emit <think> traces; suppress them so the body is pure JSON. */
export function isGroqReasoningModel(provider: Provider, model: string): boolean {
  return provider === "groq" && /qwen3/i.test(model);
}

function responseFormat(
  config: OpenAiCompatibleConfig,
  request: CompletionRequest
): Record<string, unknown> | null {
  if (config.jsonMode === false) return null;
  const schemaMode =
    config.provider === "groq"
      ? groqModelSupportsJsonSchema(request.model)
      : true;
  if (config.structuredOutputs && schemaMode && request.responseJsonSchema) {
    return {
      type: "json_schema",
      json_schema: {
        name: "worklight_structured_result",
        // Strict mode requires every object property to be required. Current
        // sync schemas satisfy that; future schemas with optional properties
        // still receive schema guidance without causing a provider 400.
        strict: everyObjectFieldIsRequired(request.responseJsonSchema),
        schema: request.responseJsonSchema,
      },
    };
  }
  return { type: "json_object" };
}

/** Exported to make the exact provider contract regression-testable. */
export function buildOpenAiCompatibleRequestBody(
  config: OpenAiCompatibleConfig,
  request: CompletionRequest
): Record<string, unknown> {
  const usesModernOpenAiTokenParams =
    config.provider === "openai" && /^gpt-5(?:\.|-|$)/i.test(request.model);
  const format = responseFormat(config, request);

  return {
    model: request.model,
    messages: [
      { role: "system", content: request.systemPrompt },
      {
        role: "user",
        content:
          request.imageUrls && request.imageUrls.length > 0
            ? [
                { type: "text", text: request.userPrompt },
                ...request.imageUrls.map((imageUrl) => ({
                  type: "image_url",
                  image_url: { url: imageUrl },
                })),
              ]
            : request.userPrompt,
      },
    ],
    ...(!usesModernOpenAiTokenParams
      ? { temperature: request.temperature ?? 0.2 }
      : {}),
    ...(usesModernOpenAiTokenParams
      ? { max_completion_tokens: request.maxTokens ?? 4096 }
      : { max_tokens: request.maxTokens ?? 4096 }),
    ...(format ? { response_format: format } : {}),
    ...(config.reasoningEffort
      ? { reasoning_effort: config.reasoningEffort }
      : {}),
    // Keep reasoning out of the returned content for Groq thinking models so
    // JSON parsing/validation sees only the answer, not the <think> trace.
    ...(isGroqReasoningModel(config.provider, request.model)
      ? { reasoning_format: "hidden" }
      : {}),
  };
}

export function createOpenAiCompatibleClient(config: OpenAiCompatibleConfig): ProviderClient {
  async function complete(request: CompletionRequest): Promise<CompletionResponse> {
    const maxRateLimitAttempts = 3;

    for (let rateLimitAttempt = 0; rateLimitAttempt < maxRateLimitAttempts; rateLimitAttempt++) {
      let response: Response;
      try {
        response = await fetch(config.chatCompletionsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${request.apiKey}`,
          },
          body: JSON.stringify(buildOpenAiCompatibleRequestBody(config, request)),
          signal: AbortSignal.timeout(config.requestTimeoutMs ?? REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new LlmError("network_error", `Failed to reach the ${config.label} API.`, err);
      }

      let body: OpenAiChatCompletion;
      try {
        body = await response.json();
      } catch (err) {
        throw new LlmError(
          "provider_error",
          `${config.label} returned a non-JSON response.`,
          err
        );
      }

      if (!response.ok) {
        const message =
          body.error?.message ?? `${config.label} request failed with status ${response.status}.`;
        if (isDailyRateLimit(message)) {
          throw new LlmError("rate_limit_daily", message, body);
        }
        const waitMs = parseRateLimitWaitMs(message);
        if (waitMs && rateLimitAttempt < maxRateLimitAttempts - 1) {
          await sleep(waitMs);
          continue;
        }
        throw new LlmError("provider_error", message, body);
      }

      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== "string") {
        throw new LlmError(
          "provider_error",
          `${config.label} response did not contain message content.`,
          body
        );
      }

      const inputTokens = body.usage?.prompt_tokens;
      const outputTokens = body.usage?.completion_tokens;
      return {
        text,
        usage:
          typeof inputTokens === "number" && typeof outputTokens === "number"
            ? {
                inputTokens,
                outputTokens,
                totalTokens: body.usage?.total_tokens ?? inputTokens + outputTokens,
              }
            : undefined,
        raw: body,
      };
    }

    throw new LlmError("provider_error", `${config.label} request did not complete.`);
  }

  return { provider: config.provider, complete };
}

export async function openAiCompatibleEmbed(request: {
  apiKey: string;
  model: string;
  texts: string[];
  embeddingsUrl: string;
  label: string;
}): Promise<number[][]> {
  let response: Response;
  try {
    response = await fetch(request.embeddingsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify({ model: request.model, input: request.texts }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LlmError("network_error", `Failed to reach the ${request.label} embeddings API.`, err);
  }

  let body: OpenAiEmbeddingsResponse;
  try {
    body = await response.json();
  } catch (err) {
    throw new LlmError(
      "provider_error",
      `${request.label} returned a non-JSON embeddings response.`,
      err
    );
  }

  if (!response.ok) {
    throw new LlmError(
      "provider_error",
      body.error?.message ?? `${request.label} embeddings request failed with status ${response.status}.`,
      body
    );
  }

  const vectors = body.data
    ?.map((item) => item.embedding)
    .filter((item): item is number[] => Array.isArray(item));
  if (!vectors || vectors.length !== request.texts.length) {
    throw new LlmError(
      "provider_error",
      `${request.label} embeddings response did not include one vector per input.`,
      body
    );
  }

  return vectors;
}
