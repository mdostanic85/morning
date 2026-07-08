import "server-only";
import { LlmError, type CompletionRequest, type CompletionResponse, type ProviderClient } from "./types";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

interface AnthropicMessage {
  content?: { type: string; text?: string }[];
  error?: { message?: string };
}

/**
 * Thin adapter over Anthropic's Messages API. Uses plain `fetch` rather than
 * `@anthropic-ai/sdk` to keep this module small and easy to swap — all
 * job/prompt logic lives in router.ts, not here.
 *
 * Anthropic has no native "JSON mode" like OpenAI, so job prompts targeting
 * this provider must explicitly instruct the model to return JSON only. The
 * router's parse + schema validation step applies the same way regardless.
 */
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
        system: request.systemPrompt,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.2,
        messages: [{ role: "user", content: request.userPrompt }],
      }),
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

  return { text, raw: body };
}

export const anthropicClient: ProviderClient = {
  provider: "anthropic",
  complete,
};
