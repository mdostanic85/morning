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
  label: string;
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
          body: JSON.stringify({
            model: request.model,
            messages: [
              { role: "system", content: request.systemPrompt },
              { role: "user", content: request.userPrompt },
            ],
            temperature: request.temperature ?? 0.2,
            max_tokens: request.maxTokens ?? 4096,
            ...(config.jsonMode !== false ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

      return { text, raw: body };
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
