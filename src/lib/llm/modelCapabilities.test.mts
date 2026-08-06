import assert from "node:assert/strict";
import { test } from "node:test";
import {
  imageUrlsForModel,
  modelSupportsVision,
  orderConfigsForImages,
  stripReasoningWrappers,
} from "./modelCapabilities";

test("gpt-oss models do not support vision", () => {
  assert.equal(modelSupportsVision("groq", "openai/gpt-oss-120b"), false);
  assert.equal(modelSupportsVision("groq", "openai/gpt-oss-20b"), false);
});

test("Groq Qwen 3.6 and OpenAI gpt-4.1 support vision", () => {
  assert.equal(modelSupportsVision("groq", "qwen/qwen3.6-27b"), true);
  assert.equal(modelSupportsVision("openai", "gpt-4.1"), true);
  assert.equal(modelSupportsVision("anthropic", "claude-sonnet-4-5"), true);
});

test("local models never claim vision support", () => {
  assert.equal(modelSupportsVision("local", "qwen3.6:35b-mlx"), false);
});

test("imageUrlsForModel strips images for text-only models", () => {
  const urls = ["https://example.com/frame.png"];
  assert.equal(imageUrlsForModel("groq", "openai/gpt-oss-120b", urls), undefined);
  assert.deepEqual(imageUrlsForModel("groq", "qwen/qwen3.6-27b", urls), urls);
  assert.equal(imageUrlsForModel("groq", "qwen/qwen3.6-27b", []), undefined);
});

test("orderConfigsForImages prefers vision models when screenshots are present", () => {
  const ordered = orderConfigsForImages(
    [
      { provider: "groq", model: "openai/gpt-oss-120b" },
      { provider: "openai", model: "gpt-4.1" },
      { provider: "groq", model: "qwen/qwen3.6-27b" },
    ],
    true
  );
  assert.equal(ordered[0]?.model, "gpt-4.1");
  assert.equal(ordered[1]?.model, "qwen/qwen3.6-27b");
  assert.equal(ordered[2]?.model, "openai/gpt-oss-120b");
});

test("orderConfigsForImages keeps original order when no images", () => {
  const configs = [
    { provider: "groq" as const, model: "openai/gpt-oss-120b" },
    { provider: "openai" as const, model: "gpt-4.1" },
  ];
  assert.deepEqual(orderConfigsForImages(configs, false), configs);
});

test("stripReasoningWrappers removes a closed <think> block", () => {
  const raw = '<think>Let me count the banners...</think>\n{"summary":"ok"}';
  assert.equal(stripReasoningWrappers(raw), '{"summary":"ok"}');
});

test("stripReasoningWrappers recovers JSON after an unclosed <think>", () => {
  const raw = '<think>reasoning that never closed then finally\n{"summary":"real"}';
  const cleaned = stripReasoningWrappers(raw);
  assert.equal(JSON.parse(cleaned).summary, "real");
});

test("stripReasoningWrappers removes markdown json fences", () => {
  const raw = '```json\n{"summary":"ok"}\n```';
  assert.equal(stripReasoningWrappers(raw), '{"summary":"ok"}');
});

test("stripReasoningWrappers leaves clean JSON untouched", () => {
  const raw = '{"summary":"clean"}';
  assert.equal(stripReasoningWrappers(raw), raw);
});
