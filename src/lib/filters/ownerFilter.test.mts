import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyTaskOwnership,
  namedForeignActor,
  taskEligibleForBriefPriority,
  taskMatchesOwner,
  myOwnerFilter,
  extractDisplayName,
} from "./ownerFilter.ts";

describe("ownerFilter null-owner classification", () => {
  it("keeps owner:null tasks for classification instead of hiding them", () => {
    const selected = myOwnerFilter("Milos Dostanic");
    assert.equal(
      taskMatchesOwner({ owner: null }, selected, "Milos Dostanic"),
      true
    );
    assert.equal(
      taskMatchesOwner({ owner: "  " }, selected, "Milos Dostanic"),
      true
    );
  });

  it("still excludes a different explicit owner", () => {
    const selected = myOwnerFilter("Milos Dostanic");
    assert.equal(
      taskMatchesOwner({ owner: "Sofija Example" }, selected, "Milos Dostanic"),
      false
    );
    assert.equal(
      taskMatchesOwner({ owner: "Milos Dostanic" }, selected, "Milos Dostanic"),
      true
    );
  });
});

describe("classifyTaskOwnership", () => {
  it("treats Sofija-owned Discord credentials as other", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: "Sofija",
          title: "Send CPQ Discord Credentials to Daniel",
          reason: "Daniel needs credentials for notification service testing",
          nextAction: "Send Discord credentials",
        },
        "Milos Dostanic"
      ),
      "other"
    );
    assert.equal(
      taskEligibleForBriefPriority(
        {
          owner: "Sofija",
          title: "Send CPQ Discord Credentials to Daniel",
        },
        "Milos Dostanic"
      ),
      false
    );
  });

  it("detects foreign actor from transcript text when owner is null", () => {
    assert.equal(
      namedForeignActor("Sofija to send CPQ Discord credentials to Daniel", "Milos Dostanic"),
      "Sofija"
    );
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Send CPQ Discord Credentials to Daniel",
          reason: "Sofija to send CPQ Discord credentials to Daniel for testing",
          nextAction: "Wait for credentials",
        },
        "Milos Dostanic"
      ),
      "other"
    );
  });

  it("keeps explicit Milos ownership as mine", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: "Milos Dostanic",
          title: "UATL-376: Promote Project Name",
          reason: "Newly assigned",
          nextAction: "Clarify CON-220 scope",
        },
        "Milos Dostanic"
      ),
      "mine"
    );
  });

  it("uses Jira assignee when owner field is empty", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "UATL-376: Promote Project Name",
          jiraAssignee: "Milos Dostanic",
        },
        "Milos Dostanic"
      ),
      "mine"
    );
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "UATL-999: Someone else's ticket",
          jiraAssignee: "Lucas",
        },
        "Milos Dostanic"
      ),
      "other"
    );
  });

  it("ignores a first-person commitment that only exists in LLM prose", () => {
    // "I will …" in a paraphrase proves nothing: the speaker may be anyone.
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Finish remaining Content File Manager screens",
          reason: "I will finish the remaining screens today",
          nextAction: "Ship the last canvas screens",
        },
        "Milos Dostanic"
      ),
      "unclear"
    );
  });

  it("marks the user's own speaker turn as mine", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Finish remaining Content File Manager screens",
          reason: "Canvas conversion was the main priority.",
          nextAction: "Ship the last canvas screens",
          evidenceQuotes: [
            "Milos: I will finish the remaining Canvas screens for UATL-367.",
          ],
        },
        "Milos Dostanic"
      ),
      "mine"
    );
  });

  it("does not treat someone else's first-person turn as the user's commitment", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Send CPQ Discord credentials",
          reason: "Credentials are needed for testing.",
          nextAction: "Wait for the credentials",
          evidenceQuotes: ["Sofija: I'll send the Discord credentials today."],
        },
        "Milos Dostanic"
      ),
      "other"
    );
  });

  it("marks a transcript turn addressed to the user as mine", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Confirm header prominence scope",
          reason: "Scope for the header change is still open.",
          nextAction: "Confirm the scope",
          evidenceQuotes: ["Milos, can you confirm the header scope before Friday?"],
        },
        "Milos Dostanic"
      ),
      "mine"
    );
  });

  it("marks a stakeholder instruction directed at the user as mine", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Draft part search banner concepts",
          reason: "Banner concepts were requested in the daily.",
          nextAction: "Draft the concepts",
          evidenceQuotes: [
            "Matt Pettit: Milos, please draft concept images for each module.",
          ],
        },
        "Milos Dostanic"
      ),
      "mine"
    );
  });

  it("leaves unattributed work as unclear, not brief-priority", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Groom frontend epic",
          reason: "Needs scheduling",
          nextAction: "Pick a time",
        },
        "Milos Dostanic"
      ),
      "unclear"
    );
    assert.equal(
      taskEligibleForBriefPriority(
        {
          owner: null,
          title: "Groom frontend epic",
          reason: "Needs scheduling",
        },
        "Milos Dostanic"
      ),
      false
    );
  });

  it("does not treat a bare Milos mention as ownership (task 410 style)", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Groom Content File Manager Frontend Epic",
          reason:
            "The team needs to groom the Content File Manager frontend epic to prepare for frontend work. Tickets follow Milos design.",
          nextAction: "Groom the frontend epic",
        },
        "Milos Dostanic"
      ),
      "unclear"
    );
    assert.equal(
      taskEligibleForBriefPriority(
        {
          owner: null,
          title: "Groom Content File Manager Frontend Epic",
          reason: "according to Milos design",
        },
        "Milos Dostanic"
      ),
      false
    );
  });

  it("does not let the model's own 'Milos to …' phrasing claim the task", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Confirm header prominence scope",
          reason: "Milos to confirm the exact scope for UATL-376",
          nextAction: "Confirm scope with James",
        },
        "Milos Dostanic"
      ),
      "unclear"
    );
  });

  it("accepts the same assignment wording when it comes from the source", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Confirm header prominence scope",
          reason: "Scope for UATL-376 is still open.",
          nextAction: "Confirm scope with James",
          evidenceQuotes: ["Action item for Milos: confirm the exact scope for UATL-376."],
        },
        "Milos Dostanic"
      ),
      "mine"
    );
  });
});

describe("LLM prose never proves ownership (tasks 552 / 535)", () => {
  it("task 552: 'Milos needs to determine' with an explicit unclear note stays unclear", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Answer the pricing question",
          reason:
            "Milos needs to determine the answer. (Unclear: It's not clear whether Milos is responsible for answering or if another team member should handle the question)",
          nextAction: "Answer the question",
        },
        "Milos Dostanic"
      ),
      "unclear"
    );
  });

  it("task 535: 'Milos must confirm' with no assigned owner stays unclear", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "Confirm PRD implementation scope",
          reason: "Milos must confirm if he is to implement the PRD section.",
          nextAction: "Confirm the scope",
        },
        "Milos Dostanic"
      ),
      "unclear"
    );
    assert.equal(
      taskEligibleForBriefPriority(
        {
          owner: null,
          title: "Confirm PRD implementation scope",
          reason: "Milos must confirm if he is to implement the PRD section.",
        },
        "Milos Dostanic"
      ),
      false
    );
  });

  it("keeps Jira assignee authoritative even when prose is silent", () => {
    assert.equal(
      classifyTaskOwnership(
        { owner: null, title: "UATL-376", jiraAssignee: "Milos Dostanic" },
        "Milos Dostanic"
      ),
      "mine"
    );
  });
});

describe("Jira mentions and labels", () => {
  it("claims work a comment directed at the user, even when someone else is the assignee", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "UATL-410: Part search API contract",
          jiraAssignee: "Lucas Saeed",
          jiraMentions: ["Milos Dostanic"],
          evidenceQuotes: [
            "@Milos Dostanic can you confirm the contract shape before Thursday?",
          ],
        },
        "Milos Dostanic"
      ),
      "mine"
    );
  });

  it("keeps a bare mention open as unclear instead of hiding it as someone else's", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "UATL-410: Part search API contract",
          reason: "The contract shape is still being decided.",
          jiraAssignee: "Lucas Saeed",
          jiraMentions: ["Milos Dostanic"],
        },
        "Milos Dostanic"
      ),
      "unclear"
    );
  });

  it("treats a label naming the user the same way", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "UATL-410: Part search API contract",
          jiraAssignee: "Lucas Saeed",
          jiraLabels: ["design", "milos-dostanic"],
        },
        "Milos Dostanic"
      ),
      "unclear"
    );
  });

  it("still disowns an issue that mentions or tags nobody relevant", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "UATL-999: Someone else's ticket",
          jiraAssignee: "Lucas Saeed",
          jiraMentions: ["Sofija Petrovic"],
          jiraLabels: ["backend"],
        },
        "Milos Dostanic"
      ),
      "other"
    );
  });

  it("does not let a mention override an explicit 'not mine' decision", () => {
    assert.equal(
      classifyTaskOwnership(
        {
          owner: null,
          title: "UATL-410: Part search API contract",
          jiraAssignee: "Lucas Saeed",
          jiraMentions: ["Milos Dostanic"],
          ownershipDecision: "rejected_not_mine",
        },
        "Milos Dostanic"
      ),
      "other"
    );
  });

  it("a mention keeps ownership open but never earns a brief slot on its own", () => {
    assert.equal(
      taskEligibleForBriefPriority(
        {
          owner: null,
          title: "UATL-410: Part search API contract",
          jiraAssignee: "Lucas Saeed",
          jiraMentions: ["Milos Dostanic"],
        },
        "Milos Dostanic"
      ),
      false
    );
  });
});

describe("diacritic folding — the defect fix", () => {
  it("Miloš Dostanić (diacritics) matches Milos Dostanic (ASCII) in taskMatchesOwner", () => {
    const selected = myOwnerFilter("Milos Dostanic");
    assert.equal(
      taskMatchesOwner({ owner: "Miloš Dostanić" }, selected, "Milos Dostanic"),
      true,
      "diacritic owner must match ASCII profile name"
    );
  });

  it("ASCII owner matches profile name with diacritics", () => {
    const selected = myOwnerFilter("Miloš Dostanić");
    assert.equal(
      taskMatchesOwner({ owner: "Milos Dostanic" }, selected, "Miloš Dostanić"),
      true
    );
  });
});

describe("extractDisplayName", () => {
  it("strips angle-bracket email wrapper, returning only the display name", () => {
    assert.equal(extractDisplayName("Alice Smith <alice@example.com>"), "Alice Smith");
    assert.equal(extractDisplayName("Lucas Saeed <lucas@spaceinch.com>"), "Lucas Saeed");
  });

  it("returns null for bare email addresses", () => {
    assert.equal(extractDisplayName("alice@example.com"), null);
    assert.equal(extractDisplayName("lucas@spaceinch.com"), null);
  });

  it("returns null for the 'Unknown attendee' calendar placeholder", () => {
    assert.equal(extractDisplayName("Unknown attendee"), null);
    assert.equal(extractDisplayName("Unknown"), null);
    assert.equal(extractDisplayName("UNKNOWN ATTENDEE"), null);
  });

  it("returns plain names unchanged", () => {
    assert.equal(extractDisplayName("Alice Smith"), "Alice Smith");
    assert.equal(extractDisplayName("Lucas Saeed"), "Lucas Saeed");
  });

  it("returns null for empty or whitespace", () => {
    assert.equal(extractDisplayName(""), null);
    assert.equal(extractDisplayName("   "), null);
  });
});
