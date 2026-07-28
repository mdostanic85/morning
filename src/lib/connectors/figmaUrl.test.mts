import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseFigmaUrl,
  normalizeFigmaNodeId,
  figmaDesignUrl,
  extractAllFigmaFileKeys,
} from "./figmaUrl";

describe("parseFigmaUrl", () => {
  it("parses a standard design URL with node-id", () => {
    const result = parseFigmaUrl(
      "https://www.figma.com/design/abcDEF123456/My-File?node-id=1-2"
    );
    assert.deepEqual(result, { fileKey: "abcDEF123456", nodeId: "1:2" });
  });

  it("parses a design URL without node-id", () => {
    const result = parseFigmaUrl("https://www.figma.com/design/abcDEF123456/My-File");
    assert.deepEqual(result, { fileKey: "abcDEF123456", nodeId: null });
  });

  it("parses a branch URL", () => {
    const result = parseFigmaUrl(
      "https://www.figma.com/design/abcDEF123456/branch/BRANCHKEY123/My-Branch?node-id=3-4"
    );
    assert.ok(result);
    assert.equal(result.fileKey, "BRANCHKEY123");
    assert.equal(result.nodeId, "3:4");
  });

  it("returns null for non-Figma URLs", () => {
    assert.equal(parseFigmaUrl("https://example.com/design/abc"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(parseFigmaUrl(""), null);
  });
});

describe("normalizeFigmaNodeId", () => {
  it("replaces dash with colon", () => {
    assert.equal(normalizeFigmaNodeId("1-2"), "1:2");
  });

  it("leaves colon form unchanged", () => {
    assert.equal(normalizeFigmaNodeId("1:2"), "1:2");
  });
});

describe("figmaDesignUrl", () => {
  it("builds URL without node id", () => {
    assert.equal(figmaDesignUrl("ABCKEY12345"), "https://www.figma.com/design/ABCKEY12345");
  });

  it("builds URL with node id using dash separator", () => {
    assert.equal(
      figmaDesignUrl("ABCKEY12345", "1:2"),
      "https://www.figma.com/design/ABCKEY12345?node-id=1-2"
    );
  });

  it("handles null node id", () => {
    assert.equal(figmaDesignUrl("ABCKEY12345", null), "https://www.figma.com/design/ABCKEY12345");
  });
});

describe("extractAllFigmaFileKeys", () => {
  it("extracts a single key from a design URL", () => {
    const keys = extractAllFigmaFileKeys([
      "Check out https://www.figma.com/design/XYZKEY98765/My-File for the design.",
    ]);
    assert.deepEqual(keys, ["XYZKEY98765"]);
  });

  it("extracts keys from multiple texts and deduplicates", () => {
    const keys = extractAllFigmaFileKeys([
      "figma.com/design/KEYAAA11111 and figma.com/design/KEYBBB22222",
      "Another mention: figma.com/design/KEYAAA11111",
    ]);
    assert.equal(keys.length, 2);
    assert.ok(keys.includes("KEYAAA11111"));
    assert.ok(keys.includes("KEYBBB22222"));
  });

  it("also handles legacy /file/ path", () => {
    const keys = extractAllFigmaFileKeys([
      "https://www.figma.com/file/LEGACYKEY1234/Old-file",
    ]);
    assert.deepEqual(keys, ["LEGACYKEY1234"]);
  });

  it("returns empty array when no Figma URLs present", () => {
    const keys = extractAllFigmaFileKeys(["No figma link here."]);
    assert.deepEqual(keys, []);
  });

  it("ignores short keys (less than 10 chars)", () => {
    const keys = extractAllFigmaFileKeys(["figma.com/design/SHORT/name"]);
    assert.deepEqual(keys, []);
  });
});
