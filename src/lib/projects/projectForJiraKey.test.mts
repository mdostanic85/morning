import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectForJiraKey, projectStatusForJiraKey } from "./projectForJiraKey.ts";
import type { Project } from "@/domain/project.ts";

function makeProject(
  id: number,
  jiraKeys: string[],
  name = `Project ${id}`,
  status: Project["status"] = "active"
): Pick<Project, "id" | "jiraKeys" | "name" | "status"> {
  return { id, jiraKeys, name, status };
}

describe("projectForJiraKey", () => {
  it("returns null when no project claims the key", () => {
    const projects = [makeProject(1, ["OTHER"])];
    assert.equal(projectForJiraKey(projects, "UATL"), null);
  });

  it("returns the only claiming project", () => {
    const projects = [makeProject(1, ["UATL"])];
    assert.equal(projectForJiraKey(projects, "UATL")?.id, 1);
  });

  it("specific project (fewest keys) beats the umbrella — the core defect fix", () => {
    const umbrella = makeProject(18, ["ASCSI", "BOM", "CON", "DATHUB", "HF", "HS", "SEIS", "SUBMGR", "UATL"], "Hydra");
    const specific = makeProject(5, ["CON"], "Hydra – Content");
    // Umbrella claims CON alongside eight other keys; specific project claims only CON.
    const projects = [umbrella, specific];
    assert.equal(projectForJiraKey(projects, "CON")?.id, 5, "specific (1 key) must beat umbrella (9 keys)");
  });

  it("result is order-independent — umbrella first in array still loses", () => {
    const umbrella = makeProject(18, ["CON", "BOM", "HF"], "Hydra");
    const specific = makeProject(22, ["CON"], "Hydra – Content");
    // Umbrella appears first in the array.
    assert.equal(projectForJiraKey([umbrella, specific], "CON")?.id, 22);
    // Specific appears first — same result.
    assert.equal(projectForJiraKey([specific, umbrella], "CON")?.id, 22);
  });

  it("breaks ties by lowest id when jiraKeys lengths are equal", () => {
    const a = makeProject(10, ["CON"]);
    const b = makeProject(3, ["CON"]);
    assert.equal(projectForJiraKey([a, b], "CON")?.id, 3);
    assert.equal(projectForJiraKey([b, a], "CON")?.id, 3);
  });

  it("matching is case-insensitive", () => {
    const projects = [makeProject(1, ["UATL"])];
    assert.equal(projectForJiraKey(projects, "uatl")?.id, 1);
    assert.equal(projectForJiraKey(projects, "Uatl")?.id, 1);
  });
});

describe("projectStatusForJiraKey", () => {
  it("returns the status of the most specific project", () => {
    const umbrella = makeProject(18, ["CON", "BOM", "HF"], "Hydra", "active");
    const specific = makeProject(22, ["CON"], "Hydra – Content", "inactive");
    assert.equal(projectStatusForJiraKey([umbrella, specific], "CON"), "inactive",
      "inactive specific project must be respected even when umbrella is active");
  });

  it("returns null when no project claims the key", () => {
    assert.equal(projectStatusForJiraKey([], "CON"), null);
  });
});
