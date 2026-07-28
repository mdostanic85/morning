import "server-only";
import { LlmError, type CompletionRequest, type CompletionResponse, type ProviderClient } from "./types";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 60_000;

interface AnthropicMessage {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } };

/**
 * Thin adapter over Anthropic's Messages API. Uses plain `fetch` rather than
 * `@anthropic-ai/sdk` to keep this module small and easy to swap — all
 * job/prompt logic lives in router.ts, not here.
 *
 * Anthropic has no native "JSON mode" like OpenAI, so job prompts targeting
 * this provider must explicitly instruct the model to return JSON only. The
 * router's parse + schema validation step applies the same way regardless.
 */
const JSON_MODE_SUFFIX =
  "\n\nRespond with ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object.";

/** Exported for contract tests — mirrors the Messages API user content shape. */
export function buildAnthropicUserContent(
  request: Pick<CompletionRequest, "userPrompt" | "imageUrls">
): string | AnthropicContentBlock[] {
  if (!request.imageUrls || request.imageUrls.length === 0) {
    return request.userPrompt;
  }
  return [
    { type: "text", text: request.userPrompt },
    ...request.imageUrls.map(
      (url): AnthropicContentBlock => ({
        type: "image",
        source: { type: "url", url },
      })
    ),
  ];
}

async function complete(request: CompletionRequest): Promise<CompletionResponse> {
  let response: Response;
  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": request.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: request.model,
        system: request.systemPrompt + JSON_MODE_SUFFIX,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.2,
        messages: [{ role: "user", content: buildAnthropicUserContent(request) }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LlmError("network_error", "Failed to reach the Anthropic API.", err);
  }

  let body: AnthropicMessage;
  try {
    body = await response.json();
  } catch (err) {
    throw new LlmError("provider_error", "Anthropic returned a non-JSON response.", err);
  }

  if (!response.ok) {
    throw new LlmError(
      "provider_error",
      body.error?.message ?? `Anthropic request failed with status ${response.status}.`,
      body
    );
  }

  const text = body.content?.find((block) => block.type === "text")?.text;
  if (typeof text !== "string") {
    throw new LlmError("provider_error", "Anthropic response did not contain text content.", body);
  }

  const inputTokens = body.usage?.input_tokens;
  const outputTokens = body.usage?.output_tokens;
  return {
    text,
    usage:
      typeof inputTokens === "number" && typeof outputTokens === "number"
        ? {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          }
        : undefined,
    raw: body,
  };
}

export const anthropicClient: ProviderClient = {
  provider: "anthropic",
  complete,
};
