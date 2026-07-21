import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankWorkTasks } from "../tasks/priorityRank.ts";
import type { SourceItem } from "../../domain/sourceItem.ts";
import {
  JUL20_EXPECTED_BRIEF,
  JUL20_MY_NAME,
  JUL20_TODAY,
  jul20JiraPending,
  jul20SourceById,
  jul20Sources,
  jul20Tasks,
} from "../../../test/fixtures/jul20DailyBriefScenario.mts";
import { JUL20_DAILY_BRIEF_V2_TARGET } from "./types.ts";
import { shouldSkipJiraTaskExtraction } from "../tasks/dailyFocus.ts";
import { composeDailyBriefV2, validateDailyBriefCitations } from "./composer.ts";
import { planJiraDoneReconciliation } from "../imports/jiraDoneReconciliation.ts";

function asSourceItems(): Map<number, SourceItem> {
  return new Map(
    jul20Sources.map((source) => [
      source.id,
      {
        ...source,
        sourceType: source.sourceType,
      } satisfies SourceItem,
    ])
  );
}

describe("jul20 daily brief scenario", () => {
  it("fixture includes required Jul 20 signals without inventing CON-220 body", () => {
    const keys = jul20Sources.map((source) => source.sourceExternalId);
    assert.ok(keys.includes("UATL-376"));
    assert.ok(keys.includes("UATL-367"));
    assert.ok(keys.includes("UATL-233"));
    assert.ok(jul20Sources.some((source) => source.title === "Hydra Daily"));
    assert.ok(
      jul20Sources.some(
        (source) =>
          source.sourceType === "figma" && source.metadata?.commentsImported === false
      )
    );

    const uatl376 = jul20Sources.find((source) => source.sourceExternalId === "UATL-376")!;
    assert.match(uatl376.body, /CON-220/);

    const con220 = jul20Sources.find((source) => source.sourceExternalId === "CON-missing")!;
    assert.equal(con220.body, "");
    assert.equal(con220.metadata?.missingEvidence, "CON-220 comment");
  });

  it("Done reconciliation closes UATL-367 work item before ranking", () => {
    const actions = planJiraDoneReconciliation({
      tasks: jul20Tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        statusManuallySet: task.statusManuallySet,
        evidence: task.evidence.map((item) => ({ sourceItemId: item.sourceItemId })),
      })),
      sources: jul20Sources.map((source) => ({
        id: source.id,
        sourceType: source.sourceType,
        sourceExternalId: source.sourceExternalId,
        title: source.title,
        metadata: source.metadata,
      })),
    });
    assert.ok(actions.some((action) => action.jiraKey === "UATL-367"));
  });

  it("claim-aware ranking prefers new UATL-376 assignment over Done Canvas commitment", () => {
    const ranked = rankWorkTasks(
      jul20Tasks,
      JUL20_TODAY,
      asSourceItems(),
      jul20JiraPending,
      { myName: JUL20_MY_NAME }
    );

    assert.ok(ranked.length >= 2);
    const top = ranked[0];
    assert.ok(top.taskId === 430 || top.taskId === 432);
    assert.equal(top.jiraKey, "UATL-376");

    const canvas = ranked.find((entry) => entry.taskId === 367);
    assert.ok(canvas);
    assert.equal(canvas.forceInclude, false);
    assert.ok(top.score > canvas.score);
  });

  it("characterization: UATL-367 Jira Done should skip fresh extraction", () => {
    const doneSource = jul20SourceById().get(502)!;
    assert.equal(shouldSkipJiraTaskExtraction(doneSource.metadata), true);
  });

  it("composer builds DailyBriefV2 matching Jul 20 target decisions", () => {
    const brief = composeDailyBriefV2({
      today: JUL20_TODAY,
      tasks: jul20Tasks,
      sources: jul20Sources as unknown as SourceItem[],
      jiraPending: jul20JiraPending,
      meetings: [{ title: "Hydra Daily" }],
      attendance: { myName: JUL20_MY_NAME },
      myName: JUL20_MY_NAME,
    });

    assert.equal(brief.todayFirst.jiraKey, "UATL-376");
    assert.equal(brief.todayFirst.statusHint, "unclear");
    assert.ok(
      brief.coverageWarnings.some((warning) => warning.code === "missing_linked_jira")
    );
    assert.equal(brief.reviewReadiness?.verified, false);
    assert.equal(brief.reviewReadiness?.warning, "not verified");
    assert.ok(brief.meetingPrep.some((prep) => prep.meetingTitle === "Hydra Daily"));
    assert.ok(brief.dayChange?.text.includes("UATL-376"));
    assert.ok(
      !brief.afterThat.some((item) => item.jiraKey === "UATL-367") &&
        !brief.todayFirst.jiraKey?.includes("367")
    );
    assert.ok(
      brief.blockedWaiting.some((item) => item.jiraKey === "UATL-233") ||
        brief.afterThat.some((item) => item.jiraKey === "UATL-233")
    );

    const known = new Set(jul20Sources.map((source) => source.id));
    const validation = validateDailyBriefCitations(brief, known);
    assert.equal(validation.ok, true);
  });

  it("composer never ranks another person's action item as afterThat", () => {
    const foreign = {
      ...jul20Tasks[0],
      id: 999,
      title: "Send CPQ Discord Credentials to Daniel",
      reason: "Sofija to send CPQ Discord credentials to Daniel for testing",
      nextAction: "Send Discord credentials",
      owner: "Sofija",
      status: "now" as const,
      priorityScore: 0.99,
      confidence: 0.99,
      evidence: jul20Tasks[0].evidence,
    };
    const brief = composeDailyBriefV2({
      today: JUL20_TODAY,
      tasks: [...jul20Tasks, foreign],
      sources: jul20Sources as unknown as SourceItem[],
      jiraPending: jul20JiraPending,
      meetings: [{ title: "Hydra Daily" }],
      attendance: { myName: JUL20_MY_NAME },
      myName: JUL20_MY_NAME,
    });

    assert.notEqual(brief.todayFirst.taskId, foreign.id, "must not promote Sofija's task");
    assert.notEqual(brief.todayFirst.title, foreign.title);
    assert.ok(!brief.afterThat.some((item) => item.title === foreign.title));
    assert.ok(!brief.blockedWaiting.some((item) => item.title === foreign.title));
  });

  it("target DailyBriefV2 decisions are locked", () => {
    assert.equal(JUL20_DAILY_BRIEF_V2_TARGET.todayFirst.jiraKey, "UATL-376");
    assert.equal(JUL20_DAILY_BRIEF_V2_TARGET.todayFirst.clarifyFirstAllowed, true);
    assert.equal(JUL20_EXPECTED_BRIEF.notActiveProduction.includes("UATL-367"), true);
    assert.equal(JUL20_EXPECTED_BRIEF.unclearOrWaiting.includes("UATL-233"), true);
    assert.equal(JUL20_DAILY_BRIEF_V2_TARGET.reviewReadiness?.verified, false);
  });

  it("negative: missing CON-220 content must not appear as fabricated evidence quote", () => {
    const con220 = jul20Sources.find((source) => source.sourceExternalId === "CON-missing")!;
    assert.equal(con220.body.trim(), "");
    for (const task of jul20Tasks) {
      for (const evidence of task.evidence) {
        assert.notEqual(evidence.sourceItemId, con220.id);
        assert.doesNotMatch(evidence.quote ?? "", /CON-220 comment says/i);
      }
    }
  });
});
