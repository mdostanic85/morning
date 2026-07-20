import "server-only";

import {
  LlmError,
  type CompletionRequest,
  type CompletionResponse,
  type ProviderClient,
} from "./types";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_MS = 60_000;

interface ResponsesBody {
  status?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

function outputText(body: ResponsesBody) {
  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

export const openaiResponsesClient: ProviderClient = {
  provider: "openai",
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    let response: Response;
    try {
      response = await fetch(RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          instructions: request.systemPrompt,
          input:
            request.imageUrls && request.imageUrls.length > 0
              ? [
                  {
                    role: "user",
                    content: [
                      { type: "input_text", text: request.userPrompt },
                      ...request.imageUrls.map((imageUrl) => ({
                        type: "input_image",
                        image_url: imageUrl,
                      })),
                    ],
                  },
                ]
              : request.userPrompt,
          max_output_tokens: request.maxTokens ?? 4096,
          store: false,
          text: {
            format: request.responseJsonSchema
              ? {
                  type: "json_schema",
                  name: "worklight_structured_result",
                  strict: true,
                  schema: request.responseJsonSchema,
                }
              : { type: "json_object" },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new LlmError("network_error", "Failed to reach the OpenAI Responses API.", error);
    }

    let body: ResponsesBody;
    try {
      body = (await response.json()) as ResponsesBody;
    } catch (error) {
      throw new LlmError("provider_error", "OpenAI returned a non-JSON response.", error);
    }
    if (!response.ok || body.error) {
      const message = body.error?.message ?? `OpenAI Responses API returned HTTP ${response.status}.`;
      throw new LlmError(
        response.status === 429 && /tokens per day|TPD/i.test(message)
          ? "rate_limit_daily"
          : response.status === 429
            ? "provider_error"
            : "provider_error",
        message,
        body
      );
    }
    const text = outputText(body);
    if (!text) {
      throw new LlmError(
        "provider_error",
        body.incomplete_details?.reason
          ? `OpenAI response was incomplete: ${body.incomplete_details.reason}.`
          : "OpenAI Responses API returned no output text.",
        body
      );
    }
    return {
      text,
      usage: body.usage
        ? {
            inputTokens: body.usage.input_tokens ?? 0,
            outputTokens: body.usage.output_tokens ?? 0,
            totalTokens: body.usage.total_tokens ?? 0,
          }
        : undefined,
      raw: body,
    };
  },
};
