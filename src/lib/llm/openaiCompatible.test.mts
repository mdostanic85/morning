import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenAiCompatibleRequestBody } from "./openaiCompatible";
import type { CompletionRequest } from "./types";

const baseRequest: CompletionRequest = {
  apiKey: "not-sent-by-body-builder",
  model: "openai/gpt-oss-120b",
  systemPrompt: "Return structured data.",
  userPrompt: "Extract one task.",
  maxTokens: 1024,
};

test("Groq receives strict JSON Schema for fully required sync output", () => {
  const body = buildOpenAiCompatibleRequestBody(
    {
      provider: "groq",
      chatCompletionsUrl: "https://example.test/chat/completions",
      label: "Groq",
      structuredOutputs: true,
    },
    {
      ...baseRequest,
      responseJsonSchema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["actionable", "waiting", "unclear"] },
              },
              required: ["status"],
              additionalProperties: false,
            },
          },
        },
        required: ["tasks"],
        additionalProperties: false,
      },
    }
  );

  assert.deepEqual(body.response_format, {
    type: "json_schema",
    json_schema: {
      name: "worklight_structured_result",
      strict: true,
      schema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["actionable", "waiting", "unclear"] },
              },
              required: ["status"],
              additionalProperties: false,
            },
          },
        },
        required: ["tasks"],
        additionalProperties: false,
      },
    },
  });
});

test("future schemas with optional fields use guided non-strict mode", () => {
  const body = buildOpenAiCompatibleRequestBody(
    {
      provider: "groq",
      chatCompletionsUrl: "https://example.test/chat/completions",
      label: "Groq",
      structuredOutputs: true,
    },
    {
      ...baseRequest,
      responseJsonSchema: {
        type: "object",
        properties: {
          requiredValue: { type: "string" },
          optionalValue: { type: "string" },
        },
        required: ["requiredValue"],
        additionalProperties: false,
      },
    }
  );

  const responseFormat = body.response_format as {
    json_schema: { strict: boolean };
  };
  assert.equal(responseFormat.json_schema.strict, false);
});

test("local endpoints can disable JSON response_format entirely", () => {
  const body = buildOpenAiCompatibleRequestBody(
    {
      provider: "local",
      chatCompletionsUrl: "http://127.0.0.1:11434/v1/chat/completions",
      label: "Local LLM",
      jsonMode: false,
    },
    baseRequest
  );

  assert.equal("response_format" in body, false);
});

test("Groq Qwen vision model uses json_object, not json_schema", () => {
  const body = buildOpenAiCompatibleRequestBody(
    {
      provider: "groq",
      chatCompletionsUrl: "https://example.test/chat/completions",
      label: "Groq",
      structuredOutputs: true,
    },
    {
      ...baseRequest,
      model: "qwen/qwen3.6-27b",
      responseJsonSchema: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
        additionalProperties: false,
      },
    }
  );

  assert.deepEqual(body.response_format, { type: "json_object" });
  // Qwen is a thinking model — reasoning must be hidden so JSON parses cleanly.
  assert.equal(body.reasoning_format, "hidden");
});

test("Groq gpt-oss keeps json_schema and no reasoning_format", () => {
  const body = buildOpenAiCompatibleRequestBody(
    {
      provider: "groq",
      chatCompletionsUrl: "https://example.test/chat/completions",
      label: "Groq",
      structuredOutputs: true,
    },
    {
      ...baseRequest,
      model: "openai/gpt-oss-120b",
      responseJsonSchema: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
        additionalProperties: false,
      },
    }
  );

  const format = body.response_format as { type: string };
  assert.equal(format.type, "json_schema");
  assert.equal("reasoning_format" in body, false);
});

test("Anthropic user content includes image blocks when urls are present", async () => {
  const { buildAnthropicUserContent } = await import("./anthropic");
  assert.equal(buildAnthropicUserContent({ userPrompt: "hello" }), "hello");
  assert.deepEqual(
    buildAnthropicUserContent({
      userPrompt: "audit this",
      imageUrls: ["https://example.com/a.png"],
    }),
    [
      { type: "text", text: "audit this" },
      { type: "image", source: { type: "url", url: "https://example.com/a.png" } },
    ]
  );
});
