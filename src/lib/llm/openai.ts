import "server-only";
import { LlmError, type CompletionRequest, type CompletionResponse, type ProviderClient } from "./types";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

interface OpenAiChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

/**
 * Thin adapter over OpenAI's Chat Completions API. Deliberately uses plain
 * `fetch` rather than the `openai` SDK to keep this module small and easy to
 * swap — all job/prompt logic lives in router.ts, not here.
 */
async function complete(request: CompletionRequest): Promise<CompletionResponse> {
  let response: Response;
  try {
    response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
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
        max_tokens: request.maxTokens ?? 1024,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    throw new LlmError("network_error", "Failed to reach the OpenAI API.", err);
  }

  let body: OpenAiChatCompletion;
  try {
    body = await response.json();
  } catch (err) {
    throw new LlmError("provider_error", "OpenAI returned a non-JSON response.", err);
  }

  if (!response.ok) {
    throw new LlmError(
      "provider_error",
      body.error?.message ?? `OpenAI request failed with status ${response.status}.`,
      body
    );
  }

  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new LlmError("provider_error", "OpenAI response did not contain message content.", body);
  }

  return { text, raw: body };
}

export const openaiClient: ProviderClient = {
  provider: "openai",
  complete,
};
