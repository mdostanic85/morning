import "server-only";
import { createOpenAiCompatibleClient } from "./openaiCompatible";

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

export const groqClient = createOpenAiCompatibleClient({
  provider: "groq",
  chatCompletionsUrl: GROQ_CHAT_COMPLETIONS_URL,
  label: "Groq",
});
