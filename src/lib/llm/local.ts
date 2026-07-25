import "server-only";
import { getLocalLlmConfig } from "@/services/settings";
import { createOpenAiCompatibleClient } from "./openaiCompatible";
import {
  LlmError,
  type CompletionRequest,
  type CompletionResponse,
  type ProviderClient,
} from "./types";

const LOCAL_REQUEST_TIMEOUT_MS = 5 * 60_000;

export function resolveLocalChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  return `${normalized}/chat/completions`;
}

// A single large MLX model is usually served by one process. Serialize calls
// so parallel provider waves do not load the same 35B model several times or
// exhaust unified memory.
let localQueue: Promise<void> = Promise.resolve();

function serializeLocalCall<T>(operation: () => Promise<T>): Promise<T> {
  const result = localQueue.then(operation, operation);
  localQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function complete(request: CompletionRequest): Promise<CompletionResponse> {
  return serializeLocalCall(async () => {
    const config = await getLocalLlmConfig();
    if (!config) {
      throw new LlmError(
        "missing_api_key",
        "Local LLM is not configured. Add its base URL and model in Settings."
      );
    }

    const client = createOpenAiCompatibleClient({
      provider: "local",
      chatCompletionsUrl: resolveLocalChatCompletionsUrl(config.baseUrl),
      label: "Local LLM",
      // Ollama's OpenAI-compatible endpoint supports response_format with a
      // JSON Schema. Other generic MLX servers are kept on prompt-only JSON
      // so a configured endpoint is never broken by an unsupported field.
      jsonMode: config.baseUrl.includes("127.0.0.1:11434") ||
        config.baseUrl.includes("localhost:11434"),
      structuredOutputs: config.baseUrl.includes("127.0.0.1:11434") ||
        config.baseUrl.includes("localhost:11434"),
      // Qwen thinking models can otherwise spend the entire max_tokens budget
      // in Ollama's separate `reasoning` field and return empty `content`.
      reasoningEffort: "none",
      requestTimeoutMs: LOCAL_REQUEST_TIMEOUT_MS,
    });
    return client.complete({
      ...request,
      apiKey: config.apiKey,
      model: config.model,
    });
  });
}

export const localClient: ProviderClient = {
  provider: "local",
  complete,
};
