import assert from "node:assert/strict";
import test from "node:test";
import { buildGeminiRequestBody, geminiClient, resolvePublicLlmModel } from "./gemini";
import { LlmError, type CompletionRequest } from "./types";

const baseRequest: CompletionRequest = {
  apiKey: "test-key",
  model: "gemini-3.1-flash-lite",
  systemPrompt: "Report only what the material says.",
  userPrompt: "Summarise this changelog.",
  maxTokens: 2048,
};

interface FetchCall {
  url: string;
  init: RequestInit;
}

/** Replaces global fetch with one canned response and records the request. */
function stubFetch(response: { status?: number; body: unknown }): {
  calls: FetchCall[];
  restore: () => void;
} {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("system prompt goes to systemInstruction, never into contents", () => {
  const body = buildGeminiRequestBody(baseRequest);

  assert.deepEqual(body.systemInstruction, {
    parts: [{ text: "Report only what the material says." }],
  });
  assert.deepEqual(body.contents, [
    { role: "user", parts: [{ text: "Summarise this changelog." }] },
  ]);
});

test("a supplied schema switches on JSON mode without sending responseSchema", () => {
  const withSchema = buildGeminiRequestBody({
    ...baseRequest,
    responseJsonSchema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
      additionalProperties: false,
    },
  });
  const generationConfig = withSchema.generationConfig as Record<string, unknown>;
  assert.equal(generationConfig.responseMimeType, "application/json");
  assert.equal("responseSchema" in generationConfig, false);
  // Public jobs stay deterministic unless a caller asks otherwise.
  assert.equal(generationConfig.temperature, 0.2);
  assert.equal(generationConfig.maxOutputTokens, 2048);

  const withoutSchema = buildGeminiRequestBody(baseRequest);
  assert.equal(
    "responseMimeType" in (withoutSchema.generationConfig as Record<string, unknown>),
    false
  );
});

test("resolvePublicLlmModel prefers PUBLIC_LLM_MODEL over the default", () => {
  const original = process.env.PUBLIC_LLM_MODEL;
  try {
    delete process.env.PUBLIC_LLM_MODEL;
    assert.equal(resolvePublicLlmModel(), "gemini-3.1-flash-lite");
    process.env.PUBLIC_LLM_MODEL = "gemini-3.1-pro";
    assert.equal(resolvePublicLlmModel(), "gemini-3.1-pro");
  } finally {
    if (original === undefined) delete process.env.PUBLIC_LLM_MODEL;
    else process.env.PUBLIC_LLM_MODEL = original;
  }
});

test("the API key travels as a header, not in the request URL", async () => {
  const stub = stubFetch({
    body: { candidates: [{ content: { parts: [{ text: "{}" }] } }] },
  });
  try {
    await geminiClient.complete(baseRequest);
  } finally {
    stub.restore();
  }

  const [call] = stub.calls;
  assert.equal(
    call.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent"
  );
  assert.equal(call.url.includes("test-key"), false);
  assert.equal(
    (call.init.headers as Record<string, string>)["x-goog-api-key"],
    "test-key"
  );
});

test("multi-part candidates are concatenated and usage is reported", async () => {
  const stub = stubFetch({
    body: {
      candidates: [{ content: { parts: [{ text: '{"summary":' }, { text: '"ok"}' }] } }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 },
    },
  });
  try {
    const result = await geminiClient.complete(baseRequest);
    assert.equal(result.text, '{"summary":"ok"}');
    assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 30, totalTokens: 150 });
  } finally {
    stub.restore();
  }
});

test("an empty response fails instead of returning blank text", async () => {
  const stub = stubFetch({
    body: { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] },
  });
  try {
    await assert.rejects(
      () => geminiClient.complete(baseRequest),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "provider_error" &&
        err.message.includes("MAX_TOKENS")
    );
  } finally {
    stub.restore();
  }
});

test("a blocked prompt surfaces the block reason", async () => {
  const stub = stubFetch({
    body: { promptFeedback: { blockReason: "SAFETY" } },
  });
  try {
    await assert.rejects(
      () => geminiClient.complete(baseRequest),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "provider_error" &&
        err.message.includes("SAFETY")
    );
  } finally {
    stub.restore();
  }
});

test("quota errors map to the rate limit kind so the router stops retrying", async () => {
  const stub = stubFetch({
    status: 429,
    body: { error: { message: "Quota exceeded for quota metric 'Generate requests'.", status: "RESOURCE_EXHAUSTED" } },
  });
  try {
    await assert.rejects(
      () => geminiClient.complete(baseRequest),
      (err: unknown) => err instanceof LlmError && err.kind === "rate_limit_daily"
    );
  } finally {
    stub.restore();
  }
});
