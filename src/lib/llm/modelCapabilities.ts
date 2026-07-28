import type { ModelConfig, Provider } from "./types";

/**
 * Which (provider, model) pairs actually accept image_url / vision content
 * through our provider adapters. Keep this conservative: a false negative
 * only drops the screenshot (text evidence still goes in the prompt); a false
 * positive causes a hard provider_error and kills the whole job.
 */
export function modelSupportsVision(provider: Provider, model: string): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return false;

  switch (provider) {
    case "openai":
      // gpt-4.1 / gpt-4o / gpt-5 / o-series all accept images via Responses API.
      return /^(gpt-4|gpt-5|o[1-9])/.test(id);
    case "anthropic":
      return id.includes("claude");
    case "groq":
      // gpt-oss is text-only. Current Groq vision model is Qwen 3.6 27B;
      // Llama 4 Scout was shut down 2026-07-17.
      if (id.includes("gpt-oss")) return false;
      if (id.includes("qwen3.6") || id.includes("qwen/qwen3.6")) return true;
      if (id.includes("llama-4")) return true;
      return false;
    case "local":
      // Local endpoints vary; never assume vision.
      return false;
  }
}

/** Drop imageUrls when the target model cannot consume them. */
export function imageUrlsForModel(
  provider: Provider,
  model: string,
  imageUrls: string[] | undefined
): string[] | undefined {
  if (!imageUrls || imageUrls.length === 0) return undefined;
  if (!modelSupportsVision(provider, model)) return undefined;
  return imageUrls;
}

/** When a job carries screenshots, try vision-capable configs before text-only. */
export function orderConfigsForImages(
  configs: ModelConfig[],
  hasImages: boolean
): ModelConfig[] {
  if (!hasImages || configs.length < 2) return configs;
  return [...configs].sort((a, b) => {
    const aVision = modelSupportsVision(a.provider, a.model) ? 0 : 1;
    const bVision = modelSupportsVision(b.provider, b.model) ? 0 : 1;
    return aVision - bVision;
  });
}

/**
 * Thinking models (Qwen 3.x on Groq, local Ollama) may prepend a
 * `<think>…</think>` trace or wrap the answer in ```json fences even when
 * asked for raw JSON. Strip both before parsing so one stray reasoning block
 * doesn't waste the whole job on an invalid_json failure.
 */
export function stripReasoningWrappers(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // A truncated/unclosed opening tag: drop everything up to the first '{' or '['.
  if (/<think>/i.test(out)) {
    const jsonStart = out.search(/[[{]/);
    if (jsonStart > 0) out = out.slice(jsonStart);
  }
  out = out.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  return out.trim();
}
