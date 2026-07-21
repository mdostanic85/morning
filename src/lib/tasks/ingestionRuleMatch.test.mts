import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applicableIngestionRules, ruleAppliesToSource } from "./ingestionRuleMatch";

describe("ingestionRuleMatch (WL-08)", () => {
  it("a global rule (no scope) applies to every source", () => {
    const rule = { sourceType: null, projectId: null, rule: "Ignore CI noise", active: true };
    assert.equal(ruleAppliesToSource(rule, { sourceType: "github", projectId: 5 }), true);
    assert.equal(ruleAppliesToSource(rule, { sourceType: "jira", projectId: null }), true);
  });

  it("a connector-scoped rule only applies to that connector", () => {
    const rule = { sourceType: "github", projectId: null, rule: "Ignore CI noise", active: true };
    assert.equal(ruleAppliesToSource(rule, { sourceType: "github", projectId: 5 }), true);
    assert.equal(ruleAppliesToSource(rule, { sourceType: "jira", projectId: 5 }), false);
  });

  it("a project-scoped rule only applies to that project", () => {
    const rule = { sourceType: null, projectId: 5, rule: "Attribute to Project X", active: true };
    assert.equal(ruleAppliesToSource(rule, { sourceType: "github", projectId: 5 }), true);
    assert.equal(ruleAppliesToSource(rule, { sourceType: "github", projectId: 6 }), false);
    assert.equal(ruleAppliesToSource(rule, { sourceType: "github", projectId: null }), false);
  });

  it("an inactive rule never applies, regardless of scope", () => {
    const rule = { sourceType: null, projectId: null, rule: "Ignore everything", active: false };
    assert.equal(ruleAppliesToSource(rule, { sourceType: "github", projectId: null }), false);
  });

  it("requires both scope dimensions to match when both are set", () => {
    const rule = { sourceType: "github", projectId: 5, rule: "Scoped rule", active: true };
    assert.equal(ruleAppliesToSource(rule, { sourceType: "github", projectId: 5 }), true);
    assert.equal(ruleAppliesToSource(rule, { sourceType: "github", projectId: 6 }), false);
    assert.equal(ruleAppliesToSource(rule, { sourceType: "jira", projectId: 5 }), false);
  });

  // WL-08 acceptance criteria: a rule "ignore GitHub CI" measurably changes
  // extraction output for its scope — this is the deterministic half of
  // that claim: the CI source's scope must select this rule, and an
  // unrelated Jira source in the same sync must not.
  it("'ignore GitHub CI' rule selects a GitHub source and excludes a Jira source", () => {
    const rules = [
      { sourceType: "github", projectId: null, rule: "Ignore GitHub CI status noise.", active: true },
    ];
    const githubApplicable = applicableIngestionRules(rules, { sourceType: "github", projectId: 3 });
    const jiraApplicable = applicableIngestionRules(rules, { sourceType: "jira", projectId: 3 });
    assert.equal(githubApplicable.length, 1);
    assert.equal(githubApplicable[0].rule, "Ignore GitHub CI status noise.");
    assert.equal(jiraApplicable.length, 0);
  });

  it("applicableIngestionRules filters out inactive and out-of-scope rules from a mixed list", () => {
    const rules = [
      { sourceType: "github", projectId: null, rule: "Ignore CI", active: true },
      { sourceType: "jira", projectId: null, rule: "Jira only rule", active: true },
      { sourceType: "github", projectId: null, rule: "Disabled rule", active: false },
      { sourceType: null, projectId: 1, rule: "Project 1 only", active: true },
    ];
    const applicable = applicableIngestionRules(rules, { sourceType: "github", projectId: 1 });
    assert.deepEqual(
      applicable.map((r) => r.rule),
      ["Ignore CI", "Project 1 only"]
    );
  });
});
