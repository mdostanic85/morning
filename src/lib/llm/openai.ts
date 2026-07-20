import "server-only";
import { openAiCompatibleEmbed } from "./openaiCompatible";
import { openaiResponsesClient } from "./openaiResponses";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

export const openaiClient = openaiResponsesClient;

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
