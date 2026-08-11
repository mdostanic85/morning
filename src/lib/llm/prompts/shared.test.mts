import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampUntrustedText,
  MAX_UNTRUSTED_CONTENT_CHARS,
  wrapUntrustedContent,
} from "./shared";
import { buildTaskExtractorUserPrompt } from "./taskExtractor";
import { buildKnowledgeExtractorUserPrompt } from "./knowledgeExtractor";

const TRUNCATION_MARKER = /\[truncated: \d+ of \d+ characters omitted/;

function oversizedBody(): string {
  return [
    "HEAD-MARKER requirements start here.",
    "m".repeat(MAX_UNTRUSTED_CONTENT_CHARS * 2),
    "TAIL-MARKER Milos will ship the export screen on Friday.",
  ].join("\n");
}

describe("clampUntrustedText", () => {
  it("leaves ordinary content untouched", () => {
    const body = "A one-hour transcript worth of text.".repeat(100);
    assert.ok(body.length < MAX_UNTRUSTED_CONTENT_CHARS);
    assert.equal(clampUntrustedText(body), body);
  });

  it("keeps both ends of oversized content and declares the gap", () => {
    const clamped = clampUntrustedText(oversizedBody());

    assert.ok(clamped.includes("HEAD-MARKER"), "opening requirements must survive");
    assert.ok(clamped.includes("TAIL-MARKER"), "closing commitments must survive");
    assert.match(clamped, TRUNCATION_MARKER);
    assert.match(clamped, /unknown, not as absent from the source/);
  });

  it("bounds the clamped result to the requested budget plus the marker", () => {
    const clamped = clampUntrustedText("z".repeat(50_000), 1_000);

    assert.ok(clamped.length < 1_400, `unexpected length ${clamped.length}`);
    assert.ok(clamped.startsWith("z".repeat(600)));
    assert.ok(clamped.endsWith("z".repeat(400)));
  });

  it("does not truncate content exactly at the limit", () => {
    const exact = "e".repeat(MAX_UNTRUSTED_CONTENT_CHARS);
    assert.equal(clampUntrustedText(exact), exact);
  });
});

describe("wrapUntrustedContent", () => {
  it("clamps at the single choke point every prompt passes through", () => {
    const wrapped = wrapUntrustedContent("source content", oversizedBody());

    assert.match(wrapped, TRUNCATION_MARKER);
    assert.ok(wrapped.length < MAX_UNTRUSTED_CONTENT_CHARS + 1_000);
    assert.ok(wrapped.startsWith("<<<BEGIN UNTRUSTED SOURCE_CONTENT"));
    assert.ok(wrapped.trimEnd().endsWith("<<<END UNTRUSTED SOURCE_CONTENT>>>"));
  });

  it("still redacts secrets before clamping", () => {
    const wrapped = wrapUntrustedContent(
      "source content",
      `token: ghp_${"a".repeat(36)}\n${"pad ".repeat(30_000)}`
    );

    assert.ok(!wrapped.includes(`ghp_${"a".repeat(36)}`), "secret must not survive");
  });
});

describe("per-source extraction prompts", () => {
  it("bounds an oversized source body for task extraction", () => {
    const prompt = buildTaskExtractorUserPrompt({
      sourceTitle: "Huge Confluence export",
      sourceType: "confluence",
      sourceDate: "2026-08-11T09:00:00.000Z",
      sourceAuthor: "Matt Pettit",
      sourceBody: oversizedBody(),
    });

    assert.match(prompt, TRUNCATION_MARKER);
    assert.ok(prompt.includes("HEAD-MARKER"));
    assert.ok(prompt.includes("TAIL-MARKER"));
    assert.ok(
      prompt.length < MAX_UNTRUSTED_CONTENT_CHARS + 5_000,
      `unexpected prompt length ${prompt.length}`
    );
  });

  it("bounds an oversized source body for knowledge extraction", () => {
    const prompt = buildKnowledgeExtractorUserPrompt({
      sourceTitle: "Huge meeting transcript",
      sourceType: "granola",
      sourceDate: "2026-08-11T09:00:00.000Z",
      sourceBody: oversizedBody(),
    });

    assert.match(prompt, TRUNCATION_MARKER);
    assert.ok(prompt.includes("TAIL-MARKER"));
    assert.ok(
      prompt.length < MAX_UNTRUSTED_CONTENT_CHARS + 5_000,
      `unexpected prompt length ${prompt.length}`
    );
  });
});
