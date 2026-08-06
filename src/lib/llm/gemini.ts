import "server-only";
import {
  LlmError,
  type CompletionRequest,
  type CompletionResponse,
  type ProviderClient,
} from "./types";

const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 60_000;

/** Cheapest current Gemini model — the only reason this provider exists. */
export const DEFAULT_PUBLIC_LLM_MODEL = "gemini-3.1-flash-lite";

/** Model for the public/bulk path; `PUBLIC_LLM_MODEL` overrides the default. */
export function resolvePublicLlmModel(): string {
  return process.env.PUBLIC_LLM_MODEL?.trim() || DEFAULT_PUBLIC_LLM_MODEL;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

/**
 * Thin adapter over Google's Generative Language REST API (`generateContent`).
 * Plain `fetch` rather than `@google/genai`, matching the other providers in
 * this folder — job and prompt logic stays in router.ts.
 *
 * Gemini is wired for PUBLIC, non-personal workloads only (see the
 * `public_research` job in router.ts). Nothing that carries mailbox content,
 * transcripts, tickets, or other personal data routes here.
 *
 * Images are not supported: the app only ever has image URLs, and Gemini wants
 * inline bytes or a Files API URI. `modelCapabilities.ts` reports no vision for
 * this provider, so the router strips screenshots before they reach us.
 */
export function buildGeminiRequestBody(request: CompletionRequest): Record<string, unknown> {
  return {
    // `CompletionRequest` is single-turn today. An assistant turn would map to
    // role "model"; the system prompt never belongs in `contents`.
    contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
    generationConfig: {
      temperature: request.temperature ?? 0.2,
      maxOutputTokens: request.maxTokens ?? 4096,
      // JSON mode only. `responseSchema` is deliberately not sent: Zod's JSON
      // Schema output carries keywords Gemini rejects, and the router already
      // parses, validates, and retries against the real schema.
      ...(request.responseJsonSchema ? { responseMimeType: "application/json" } : {}),
    },
    ...(request.systemPrompt
      ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } }
      : {}),
  };
}

function errorKindFor(status: number, message: string): "rate_limit_daily" | "provider_error" {
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return "rate_limit_daily";
  }
  return "provider_error";
}

async function complete(request: CompletionRequest): Promise<CompletionResponse> {
  let response: Response;
  try {
    response = await fetch(`${GEMINI_MODELS_URL}/${encodeURIComponent(request.model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header form of the documented `?key=` parameter — keeps the key out
        // of URLs, which end up in logs and error strings.
        "x-goog-api-key": request.apiKey,
      },
      body: JSON.stringify(buildGeminiRequestBody(request)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LlmError("network_error", "Failed to reach the Google Gemini API.", err);
  }

  let body: GeminiResponse;
  try {
    body = await response.json();
  } catch (err) {
    throw new LlmError("provider_error", "Google Gemini returned a non-JSON response.", err);
  }

  if (!response.ok) {
    const message =
      body.error?.message ?? `Google Gemini request failed with status ${response.status}.`;
    throw new LlmError(errorKindFor(response.status, message), message, body);
  }

  if (body.promptFeedback?.blockReason) {
    throw new LlmError(
      "provider_error",
      `Google Gemini blocked the prompt (${body.promptFeedback.blockReason}).`,
      body
    );
  }

  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
  if (!text) {
    const finishReason = body.candidates?.[0]?.finishReason;
    throw new LlmError(
      "provider_error",
      finishReason
        ? `Google Gemini returned an empty response (finishReason: ${finishReason}).`
        : "Google Gemini returned an empty response.",
      body
    );
  }

  const inputTokens = body.usageMetadata?.promptTokenCount;
  const outputTokens = body.usageMetadata?.candidatesTokenCount;
  return {
    text,
    usage:
      typeof inputTokens === "number" && typeof outputTokens === "number"
        ? {
            inputTokens,
            outputTokens,
            totalTokens: body.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens,
          }
        : undefined,
    raw: body,
  };
}

export const geminiClient: ProviderClient = {
  provider: "gemini",
  complete,
};
