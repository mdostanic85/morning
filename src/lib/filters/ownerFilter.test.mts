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

  it("marks first-person commitments as mine", () => {
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

  it("treats Milos-as-actor phrasing as mine", () => {
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
      "mine"
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
