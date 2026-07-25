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
