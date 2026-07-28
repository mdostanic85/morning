import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoverFigmaFileKeys } from "./discoverFigmaFileKeys";
import type { SourceItem } from "@/domain/sourceItem";
import type { Project } from "@/domain/project";

function makeProject(id: number, figmaFileKeys: string[], jiraKeys: string[] = []): Pick<Project, "id" | "figmaFileKeys"> & { jiraKeys: string[] } {
  return { id, figmaFileKeys, jiraKeys };
}

function makeSource(
  opts: Partial<Pick<SourceItem, "projectId" | "sourceType" | "body" | "url" | "title">>
): Pick<SourceItem, "projectId" | "sourceType" | "body" | "url" | "title"> {
  return {
    projectId: opts.projectId ?? null,
    sourceType: opts.sourceType ?? "jira",
    body: opts.body ?? "",
    url: opts.url ?? null,
    title: opts.title ?? "",
  };
}

describe("discoverFigmaFileKeys", () => {
  it("returns configured file keys from projects", () => {
    const { fileKeys } = discoverFigmaFileKeys({
      projects: [makeProject(1, ["CONFIGKEY12345"])],
      sourceItems: [],
    });
    assert.deepEqual(fileKeys, ["CONFIGKEY12345"]);
  });

  it("resolves a figma.com URL in project figmaFileKeys", () => {
    const { fileKeys } = discoverFigmaFileKeys({
      projects: [
        makeProject(1, ["https://www.figma.com/design/URLBASEDKEY1234/My-File"]),
      ],
      sourceItems: [],
    });
    assert.deepEqual(fileKeys, ["URLBASEDKEY1234"]);
  });

  it("discovers file keys from Jira source bodies", () => {
    const { fileKeys } = discoverFigmaFileKeys({
      projects: [makeProject(1, [])],
      sourceItems: [
        makeSource({
          projectId: 1,
          sourceType: "jira",
          body: "See design at https://www.figma.com/design/DISCOVEREDKEY1/name",
        }),
      ],
    });
    assert.ok(fileKeys.includes("DISCOVEREDKEY1"));
  });

  it("assigns unambiguous project to a discovered key", () => {
    const { projectIdByFileKey } = discoverFigmaFileKeys({
      projects: [makeProject(1, [])],
      sourceItems: [
        makeSource({
          projectId: 1,
          sourceType: "jira",
          body: "figma.com/design/SINGLEPROJECT1/x",
        }),
      ],
    });
    assert.equal(projectIdByFileKey.get("SINGLEPROJECT1"), 1);
  });

  it("assigns null when multiple projects claim the same key", () => {
    const { projectIdByFileKey } = discoverFigmaFileKeys({
      projects: [makeProject(1, []), makeProject(2, [])],
      sourceItems: [
        makeSource({
          projectId: 1,
          sourceType: "jira",
          body: "figma.com/design/SHAREDKEY1234/x",
        }),
        makeSource({
          projectId: 2,
          sourceType: "jira",
          body: "figma.com/design/SHAREDKEY1234/x",
        }),
      ],
    });
    assert.equal(projectIdByFileKey.get("SHAREDKEY1234"), null);
  });

  it("deduplicates file keys across sources and projects", () => {
    const { fileKeys } = discoverFigmaFileKeys({
      projects: [makeProject(1, ["CONFIGKEY12345"])],
      sourceItems: [
        makeSource({
          projectId: 1,
          sourceType: "granola",
          body: "figma.com/design/CONFIGKEY12345/x and figma.com/design/NEWKEY99999/y",
        }),
      ],
    });
    // CONFIGKEY12345 from both settings and source — should appear once
    assert.equal(fileKeys.filter((k) => k === "CONFIGKEY12345").length, 1);
    assert.ok(fileKeys.includes("NEWKEY99999"));
  });

  it("only discovers from allowed source types", () => {
    const { fileKeys } = discoverFigmaFileKeys({
      projects: [makeProject(1, [])],
      sourceItems: [
        makeSource({
          projectId: 1,
          // git is not in DISCOVERY_SOURCE_TYPES
          sourceType: "git",
          body: "figma.com/design/GITEXCLUDED1234/x",
        }),
      ],
    });
    assert.ok(!fileKeys.includes("GITEXCLUDED1234"));
  });

  it("returns empty when no keys configured and no sources", () => {
    const { fileKeys } = discoverFigmaFileKeys({
      projects: [makeProject(1, [])],
      sourceItems: [],
    });
    assert.deepEqual(fileKeys, []);
  });
});
