import "server-only";
import { createOpenAiCompatibleClient, openAiCompatibleEmbed } from "./openaiCompatible";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

export const openaiClient = createOpenAiCompatibleClient({
  provider: "openai",
  chatCompletionsUrl: OPENAI_CHAT_COMPLETIONS_URL,
  embeddingsUrl: OPENAI_EMBEDDINGS_URL,
  label: "OpenAI",
});

export async function openaiEmbed(request: {
  apiKey: string;
  model: string;
  texts: string[];
}): Promise<number[][]> {
  return openAiCompatibleEmbed({
    ...request,
    embeddingsUrl: OPENAI_EMBEDDINGS_URL,
    label: "OpenAI",
  });
}
