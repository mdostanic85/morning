import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractJiraKeysFromText,
  extractNamedWorkLabels,
  findOnlyActiveTopicAnchor,
  findTaskByExactTitleMatch,
  findTaskByNamedWorkLabel,
  isExtractRelevantToTask,
  mergeTaskTitle,
  pickPrimaryExtractedTask,
  resolveTranscriptMergeTarget,
  type MergeCandidateTask,
} from "./transcriptTaskMerge";

const MILOS = "Milos Dostanic";

/** UATL-380 golden fixture: the real "Design Part Search Banner" task. */
const uatl380Banner: MergeCandidateTask = {
  id: 487,
  title: "UATL-380 · Design Part Search Banner",
  reason:
    "The task is to design a part search banner for all modules, as described in Jira ticket UATL-380.",
  nextAction:
    "Create a new Figma frame for the unified search banner design, incorporating James' previous images as a reference.",
  status: "now",
  projectId: 1,
};

const uatl367: MergeCandidateTask = {
  id: 371,
  title: "Review UATL-367: DESIGN - Content File Manager - Convert to Canvas",
  reason: "In review in Jira",
  nextAction: "Review the Jira issue UATL-367",
  status: "next",
  projectId: 1,
};

/** Real incident (EV-06): task #468 was created from a Hydra Daily transcript
 * the day before Jira issue UATL-380 existed, so it never got a Jira key in
 * its title. The next day's Jira sync then created #487 as a duplicate
 * instead of recognizing it as the same work. */
const designBannerPreJira: MergeCandidateTask = {
  id: 468,
  title: "Design Part Search Banner",
  reason:
    "The task is to design a part search banner for all modules. Matt Pettit requested to draft concept images for each module to stack side by side as one wide banner.",
  nextAction: "Create a new Figma frame for the unified search banner design.",
  status: "later",
  projectId: 1,
  owner: "Milos Dostanic",
};

const otherLater: MergeCandidateTask = {
  id: 10,
  title: "Tidy design tokens",
  reason: "Housekeeping",
  nextAction: "Clean unused tokens",
  status: "later",
  projectId: 1,
};

const meetJackson: MergeCandidateTask = {
  id: 465,
  title: "Meet Jackson to align AI efforts",
  reason: "Lucas asked Milos to meet Jackson and align the two AI assistant efforts.",
  nextAction: "Schedule a meeting with Jackson to align the AI efforts.",
  status: "now",
  projectId: 1,
  owner: "Milos Dostanic",
};

describe("transcriptTaskMerge", () => {
  it("extracts Jira keys from free text", () => {
    assert.deepEqual(
      extractJiraKeysFromText("Finished UATL-367 and mentioned ABC-12 twice UATL-367"),
      ["UATL-367", "ABC-12"]
    );
  });

  it("merges actionable transcript items onto the Jira key task", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Hydra Daily",
        body: "Milos completed ticket 367 Content File Manager and will do final visual validation",
      },
      extracted: {
        title: "Implement Content File Manager on canvas",
        reason: "Spoken in daily",
        nextAction: "Connect screens and do final visual validation",
        status: "actionable",
        existingTaskId: null,
      },
      existingTasks: [uatl367, otherLater],
    });
    // Body says "ticket 367" — inferred as UATL-367 when that suffix is unique.
    assert.equal(resolution.taskId, 371);
    assert.equal(resolution.mode, "full");
    assert.match(resolution.reason, /jira key UATL-367/i);
  });

  describe("named work labels (SPEC, BOM-SPEC)", () => {
    const specTask: MergeCandidateTask = {
      id: 901,
      title: "Finish Hydra SPEC review",
      reason: "The SPEC needs stakeholder sign-off before implementation.",
      nextAction: "Walk Matt through the remaining SPEC sections.",
      status: "now",
      projectId: 1,
      owner: "Milos Dostanic",
    };

    it("extracts distinctive labels and skips generic acronyms", () => {
      assert.deepEqual(extractNamedWorkLabels("Please update the SPEC and check the API"), [
        "SPEC",
      ]);
      assert.deepEqual(extractNamedWorkLabels("Link the BOM-SPEC frame in Figma"), [
        "BOM-SPEC",
      ]);
      assert.deepEqual(extractNamedWorkLabels("UATL-380 is Done"), []);
    });

    it("finds the unique open task that already carries the label", () => {
      const match = findTaskByNamedWorkLabel(
        [specTask, otherLater],
        "Matt: Milos, please finish the SPEC before Friday"
      );
      assert.equal(match?.task.id, specTask.id);
      assert.equal(match?.label, "SPEC");
    });

    it("merges a transcript SPEC mention onto the existing SPEC task", () => {
      const resolution = resolveTranscriptMergeTarget({
        source: {
          sourceType: "granola",
          title: "Hydra Daily",
          body: "Matt: Milos, please finish the SPEC before Friday and share it with Lucas.",
        },
        extracted: {
          title: "Finish SPEC before Friday",
          reason: "Matt asked Milos to finish the SPEC.",
          nextAction: "Complete remaining SPEC sections and share with Lucas.",
          status: "actionable",
          existingTaskId: null,
          owner: "Milos",
        },
        existingTasks: [specTask, otherLater, uatl380Banner],
        myName: MILOS,
      });
      assert.equal(resolution.taskId, specTask.id);
      assert.equal(resolution.mode, "full");
      assert.match(resolution.reason, /named work label SPEC/i);
    });

    it("does not merge when multiple open tasks share the same label", () => {
      const otherSpec: MergeCandidateTask = {
        ...specTask,
        id: 902,
        title: "Rewrite onboarding SPEC",
      };
      const resolution = resolveTranscriptMergeTarget({
        source: {
          sourceType: "granola",
          title: "Hydra Daily",
          body: "Please update the SPEC today.",
        },
        extracted: {
          title: "Update the SPEC",
          reason: "SPEC needs an update.",
          nextAction: "Edit the SPEC document.",
          status: "actionable",
          existingTaskId: null,
          owner: "Milos",
        },
        existingTasks: [specTask, otherSpec],
        myName: MILOS,
      });
      assert.equal(resolution.taskId, null);
    });

    it("treats a shared named work label as relevance proof", () => {
      const result = isExtractRelevantToTask({
        extract: {
          title: "Finish SPEC before Friday",
          reason: "Matt asked for the SPEC",
          nextAction: "Complete the SPEC",
          owner: null,
        },
        sourceText: "Please finish the SPEC before Friday",
        target: specTask,
        myName: MILOS,
      });
      assert.equal(result.relevant, true);
      assert.match(result.reason, /named work label SPEC/i);
    });
  });

  it("forces merge when source names the full Jira key", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Content File Mgr - Review",
        body: "Feedback on UATL-367: finish remaining screens then ping for review",
      },
      extracted: {
        title: "Finish remaining Content File Manager screens",
        reason: "Review feedback",
        nextAction: "Finish the remaining Content File Manager screens",
        status: "actionable",
        existingTaskId: null,
      },
      existingTasks: [uatl367, otherLater],
    });
    assert.equal(resolution.taskId, 371);
    assert.equal(resolution.mode, "full");
    assert.match(resolution.reason, /jira key/i);
  });

  it("keeps waiting items separate even when they mention a Jira key", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Hydra Daily",
        body: "Sofija to groom frontend epic for UATL-367",
      },
      extracted: {
        title: "Groom Content File Manager Frontend Epic",
        reason: "Needs grooming",
        nextAction: "Schedule grooming",
        status: "waiting",
        existingTaskId: null,
        owner: "Sofija",
      },
      existingTasks: [uatl367],
    });
    assert.equal(resolution.taskId, null);
  });

  it("uses the only active now/next topic anchor when ownership is explicit", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Content File Mgr - Review",
        body: "Finish remaining Content File Manager screens, then ping for review",
      },
      extracted: {
        title: "Finish remaining Content File Manager screens",
        reason: "Review feedback",
        nextAction: "Finish remaining screens",
        status: "actionable",
        existingTaskId: null,
        owner: "Milos",
      },
      existingTasks: [uatl367, otherLater],
      myName: MILOS,
    });
    assert.equal(resolution.taskId, 371);
    assert.equal(resolution.mode, "full");
    assert.match(resolution.reason, /topic anchor/i);
  });

  it("does NOT topic-anchor-merge on overlap alone without explicit ownership (EV-02)", () => {
    // Same strong topical overlap as above, but nothing marks it as the
    // user's own work (no owner field, no first-person language).
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Content File Mgr - Review",
        body: "Finish remaining Content File Manager screens, then ping for review",
      },
      extracted: {
        title: "Finish remaining Content File Manager screens",
        reason: "Review feedback",
        nextAction: "Finish remaining screens",
        status: "actionable",
        existingTaskId: null,
      },
      existingTasks: [uatl367, otherLater],
      myName: MILOS,
    });
    assert.equal(resolution.taskId, null);
  });

  it("does not topic-merge waiting items without a Jira key", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Hydra Daily",
        body: "Grooming needed for Content File Manager frontend epic",
      },
      extracted: {
        title: "Groom frontend epic",
        reason: "Blocked on scheduling",
        nextAction: "Schedule with Sofija",
        status: "waiting",
        existingTaskId: null,
      },
      existingTasks: [uatl367],
    });
    assert.equal(resolution.taskId, null);
  });

  it("finds a sole focus anchor with domain overlap", () => {
    const anchor = findOnlyActiveTopicAnchor(
      [uatl367, otherLater],
      "Content File Manager review screens canvas"
    );
    assert.equal(anchor?.id, 371);
  });

  it("keeps Jira identity when merging titles", () => {
    assert.equal(
      mergeTaskTitle(uatl367.title, "Finish remaining screens"),
      uatl367.title
    );
  });

  it("picks the most concrete actionable next step", () => {
    const primary = pickPrimaryExtractedTask([
      {
        title: "A",
        reason: "r",
        nextAction: "Short",
        status: "actionable" as const,
        existingTaskId: null,
        doneCriteria: ["a"],
      },
      {
        title: "B",
        reason: "r",
        nextAction: "Finish remaining Content File Manager screens then ping Matt",
        status: "actionable" as const,
        existingTaskId: null,
        doneCriteria: ["a", "b"],
      },
    ]);
    assert.match(primary.nextAction, /Finish remaining/);
  });

  // --- UATL-380 golden fixture (docs/architecture/evidence-relevance-fix-plan.md) ---
  // Real incident: task #487 "Design Part Search Banner" accumulated 59
  // evidence rows; only the Jira ticket itself and one on-topic daily were
  // genuinely relevant. Everything else rode in on a blindly-trusted LLM
  // `existingTaskId` hint or a topic-only anchor.

  describe("EV-01: guards the existingTaskId hint", () => {
    it("does not let copied task wording validate an unrelated existingTaskId guess", () => {
      const resolution = resolveTranscriptMergeTarget({
        source: {
          sourceType: "granola",
          title: "Milos & Lucas sync",
          body: "It feels like mixing actions with status. Separate status from the call to action.",
        },
        extracted: {
          // Simulates the model copying the target fields from the open-task
          // list even though the raw meeting text never mentions Jackson.
          title: meetJackson.title,
          reason: meetJackson.reason,
          nextAction: meetJackson.nextAction,
          status: "actionable",
          existingTaskId: meetJackson.id,
          owner: "Milos Dostanic",
        },
        existingTasks: [meetJackson],
        myName: MILOS,
      });

      assert.equal(resolution.taskId, null);
    });

    it("does not merge an unrelated Gmail extract onto the banner just because the LLM hinted at it", () => {
      const resolution = resolveTranscriptMergeTarget({
        source: {
          sourceType: "gmail",
          title:
            "Mapping: ako fajl vec ima vecinu od ovih kolona moramo da olaksamo useru",
          body:
            "Mi trebamo sami inteligentno da uradimo mapiranje a korisnik samo da pregleda i ako mu izgleda ok, da ide dalje.",
        },
        extracted: {
          title: "Simplify column mapping for non-technical users",
          reason:
            "The mapping process should be simplified for users who are not technically savvy.",
          nextAction: "Auto-map columns and only ask the user to review and approve.",
          status: "actionable",
          // The LLM extractor hinted at the prominent "now" task even though
          // this extract has nothing to do with it.
          existingTaskId: uatl380Banner.id,
        },
        existingTasks: [uatl380Banner],
        myName: MILOS,
      });
      assert.equal(resolution.taskId, null);
    });

    it("does not merge a different daily's action item onto the banner via the hint alone", () => {
      // "Share prototype branch name for cross-module guidance" — a real
      // Milos action item, but from a different meeting and about a
      // different feature (cross-module guidance, not the search banner).
      const resolution = resolveTranscriptMergeTarget({
        source: {
          sourceType: "granola",
          title: "Hydra Daily",
          body: "Next Steps:\n- Share prototype branch name for cross-module guidance (Milos)\n  Post the branch link so Matt can spin it up.",
        },
        extracted: {
          title: "Share prototype branch name for cross-module guidance",
          reason: "Matt needs the branch to review actual interactions.",
          nextAction: "Post the branch link so Matt can spin it up.",
          status: "actionable",
          existingTaskId: uatl380Banner.id,
          owner: "Milos",
        },
        existingTasks: [uatl380Banner],
        myName: MILOS,
      });
      assert.equal(resolution.taskId, null);
    });

    it("still merges the real banner daily onto UATL-380 (regression guard)", () => {
      const resolution = resolveTranscriptMergeTarget({
        source: {
          sourceType: "granola",
          title: "Hydra Daily",
          body: "Working on banner design for the new unified search page. One sample done, plan to create 2-3 more banner mockups for selection, using James' previous images as loose guardrails only.",
        },
        extracted: {
          title: "Create 2-3 more banner mockups for unified search page",
          reason:
            "Milos is working on a banner design for the new unified search page and needs 2-3 more mockups for selection.",
          nextAction:
            "Use James' previous images as loose guardrails only, not constraints.",
          status: "actionable",
          existingTaskId: uatl380Banner.id,
          owner: "Milos",
        },
        existingTasks: [uatl380Banner],
        myName: MILOS,
      });
      assert.equal(resolution.taskId, uatl380Banner.id);
      assert.equal(resolution.mode, "full");
    });
  });

  describe("EV-02: topic-only anchoring requires explicit ownership", () => {
    it("does not anchor an unrelated extract onto the sole active task without a hint", () => {
      const resolution = resolveTranscriptMergeTarget({
        source: {
          sourceType: "granola",
          title: "Hydra Daily",
          body: "Christian has not been attending the daily; someone to follow up on what's going on.",
        },
        extracted: {
          title: "Follow up with Christian on daily attendance",
          reason: "Christian has not been attending the daily.",
          nextAction: "Sync with Christian on his attendance and role.",
          status: "actionable",
          existingTaskId: null,
        },
        existingTasks: [uatl380Banner],
        myName: MILOS,
      });
      assert.equal(resolution.taskId, null);
    });
  });

  describe("EV-06: exact-title dedupe across sources", () => {
    it("merges a Jira sync onto an already-existing task with the same title instead of duplicating it (real incident: #468/#487)", () => {
      const resolution = resolveTranscriptMergeTarget({
        source: {
          sourceType: "jira",
          title: "UATL-380: DESIGN - Banner for Part Search",
          body: "Design a part search banner for all modules.",
        },
        extracted: {
          title: "UATL-380 · Design Part Search Banner",
          reason:
            "The task is to design a part search banner for all modules, as described in Jira ticket UATL-380.",
          nextAction:
            "Create a new Figma frame for the unified search banner design, incorporating James' previous images as a reference.",
          status: "actionable",
          existingTaskId: null,
          owner: "Milos Dostanic",
        },
        existingTasks: [designBannerPreJira],
        myName: MILOS,
      });
      assert.equal(resolution.taskId, designBannerPreJira.id);
      assert.equal(resolution.mode, "full");
      assert.match(resolution.reason, /exact title match/i);
    });

    it("does not dedupe-merge onto an identically-titled task that explicitly belongs to someone else", () => {
      const someoneElsesTask: MergeCandidateTask = {
        ...designBannerPreJira,
        owner: "Someone Else",
      };
      const resolution = resolveTranscriptMergeTarget({
        source: {
          sourceType: "jira",
          title: "UATL-380: DESIGN - Banner for Part Search",
          body: "Design a part search banner for all modules.",
        },
        extracted: {
          title: "UATL-380 · Design Part Search Banner",
          reason: "The task is to design a part search banner for all modules.",
          nextAction: "Create a new Figma frame for the unified search banner design.",
          status: "actionable",
          existingTaskId: null,
          owner: "Milos Dostanic",
        },
        existingTasks: [someoneElsesTask],
        myName: MILOS,
      });
      assert.equal(resolution.taskId, null);
    });

    it("findTaskByExactTitleMatch ignores a leading Jira-key prefix when comparing titles", () => {
      const match = findTaskByExactTitleMatch(
        [designBannerPreJira],
        "UATL-380 · Design Part Search Banner",
        MILOS
      );
      assert.equal(match?.id, designBannerPreJira.id);
    });
  });

  describe("isExtractRelevantToTask (EV-00 shared predicate)", () => {
    const target = uatl380Banner;

    it("is relevant when the extract shares the task's Jira key", () => {
      const result = isExtractRelevantToTask({
        extract: {
          title: "Update banner ticket",
          reason: "Status update",
          nextAction: "Comment on UATL-380",
          owner: null,
        },
        sourceText: "Jira comment on UATL-380",
        target,
        myName: null,
      });
      assert.equal(result.relevant, true);
    });

    it("is relevant when ownership is explicit and topic overlap clears the bar", () => {
      const result = isExtractRelevantToTask({
        extract: {
          title: "Create more banner mockups",
          reason: "Milos is drafting banner concept images for each module",
          nextAction: "Draft banner concept images for each module",
          owner: "Milos",
        },
        sourceText: "Banner concept images for each module, stacked into one banner",
        target,
        myName: MILOS,
      });
      assert.equal(result.relevant, true);
    });

    it("is not relevant on ownership alone without topic overlap", () => {
      const result = isExtractRelevantToTask({
        extract: {
          title: "Simplify column mapping",
          reason: "Milos is simplifying the mapping process for users",
          nextAction: "Auto-map columns for the user",
          owner: "Milos",
        },
        sourceText: "Column mapping needs to be simplified for non-technical users",
        target,
        myName: MILOS,
      });
      assert.equal(result.relevant, false);
    });

    it("is not relevant on topic overlap alone without explicit ownership", () => {
      const result = isExtractRelevantToTask({
        extract: {
          title: "Banner concept images needed",
          reason: "The banner concept images for each module need drafting",
          nextAction: "Draft banner concept images",
          owner: null,
        },
        sourceText: "Banner concept images for each module",
        target,
        myName: MILOS,
      });
      assert.equal(result.relevant, false);
    });
  });
});
