import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCoverageWarnings } from "./coverage";
import type { SourceItem } from "@/domain/sourceItem";

function makeSource(overrides: Partial<SourceItem>): SourceItem {
  return {
    id: 1,
    projectId: null,
    sourceType: "figma",
    sourceExternalId: null,
    title: "test source",
    body: "body",
    author: null,
    sourceDate: "2026-07-01T00:00:00Z",
    url: null,
    metadata: null,
    contentHash: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: null,
    ...overrides,
  };
}

describe("buildCoverageWarnings — figma_not_verified", () => {
  it("warns when structure source has no node-id and no comments", () => {
    const warnings = buildCoverageWarnings({
      sources: [
        makeSource({
          sourceExternalId: "FILEKEY12345:structure",
          url: "https://www.figma.com/design/FILEKEY12345",
          metadata: { fileKey: "FILEKEY12345", importedFrom: "figma" },
        }),
      ],
    });
    assert.ok(warnings.some((w) => w.code === "figma_not_verified"));
  });

  it("clears warning when a comment row exists for the same file key", () => {
    const warnings = buildCoverageWarnings({
      sources: [
        makeSource({
          id: 1,
          sourceExternalId: "FILEKEY12345:structure",
          url: "https://www.figma.com/design/FILEKEY12345",
          metadata: { fileKey: "FILEKEY12345", importedFrom: "figma" },
        }),
        makeSource({
          id: 2,
          sourceExternalId: "FILEKEY12345:comment:c001",
          url: "https://www.figma.com/design/FILEKEY12345?node-id=1-2",
          metadata: {
            importedFrom: "figma_comment",
            fileKey: "FILEKEY12345",
            commentId: "c001",
            commentsImported: true,
          },
        }),
      ],
    });
    assert.ok(!warnings.some((w) => w.code === "figma_not_verified"));
  });

  it("clears warning when structure source has commentsImported: true", () => {
    const warnings = buildCoverageWarnings({
      sources: [
        makeSource({
          sourceExternalId: "FILEKEY12345:structure",
          url: "https://www.figma.com/design/FILEKEY12345?node-id=1-2",
          metadata: {
            fileKey: "FILEKEY12345",
            importedFrom: "figma",
            commentsImported: true,
          },
        }),
      ],
    });
    assert.ok(!warnings.some((w) => w.code === "figma_not_verified"));
  });

  it("does not warn for comment rows themselves (only structure rows are evaluated)", () => {
    const warnings = buildCoverageWarnings({
      sources: [
        makeSource({
          sourceExternalId: "FILEKEY12345:comment:c001",
          url: "https://www.figma.com/design/FILEKEY12345?node-id=1-2",
          metadata: {
            importedFrom: "figma_comment",
            fileKey: "FILEKEY12345",
            commentsImported: true,
          },
        }),
      ],
    });
    assert.ok(!warnings.some((w) => w.code === "figma_not_verified"));
  });

  it("warns for each structure file that is not covered", () => {
    const warnings = buildCoverageWarnings({
      sources: [
        makeSource({
          id: 1,
          sourceExternalId: "FILE_A_1234567890:structure",
          url: "https://www.figma.com/design/FILE_A_1234567890",
          metadata: { fileKey: "FILE_A_1234567890", importedFrom: "figma" },
        }),
        makeSource({
          id: 2,
          sourceExternalId: "FILE_B_1234567890:structure",
          url: "https://www.figma.com/design/FILE_B_1234567890",
          metadata: { fileKey: "FILE_B_1234567890", importedFrom: "figma" },
        }),
        // Comments only for FILE_A
        makeSource({
          id: 3,
          sourceExternalId: "FILE_A_1234567890:comment:c001",
          metadata: { importedFrom: "figma_comment", fileKey: "FILE_A_1234567890" },
        }),
      ],
    });
    // FILE_B has no comments, so still warns
    assert.ok(warnings.some((w) => w.code === "figma_not_verified"));
    // There should be exactly one warning (for FILE_B only)
    assert.equal(warnings.filter((w) => w.code === "figma_not_verified").length, 1);
  });
});
