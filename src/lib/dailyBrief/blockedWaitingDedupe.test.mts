import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coreTitleForDedupe, dedupeBlockedWaiting } from "./blockedWaitingDedupe";

describe("coreTitleForDedupe", () => {
  // Real production example: same meeting, same underlying action, extracted
  // twice — once naming the recipient, once not.
  it("strips a trailing 'to <Name>' recipient clause", () => {
    assert.equal(
      coreTitleForDedupe("Send CPQ Discord Credentials to Daniel"),
      coreTitleForDedupe("Send CPQ Discord Credentials")
    );
  });

  it("strips a two-word name", () => {
    assert.equal(
      coreTitleForDedupe("Send credentials to Daniel Cohen"),
      coreTitleForDedupe("Send credentials")
    );
  });

  it("does not strip an all-caps acronym (e.g. QA, CI)", () => {
    assert.equal(coreTitleForDedupe("Send report to QA"), "send report to qa");
  });

  it("does not strip a lowercase trailing word", () => {
    assert.equal(coreTitleForDedupe("Send credentials to production"), "send credentials to production");
  });

  it("is case-insensitive and whitespace-normalized", () => {
    assert.equal(coreTitleForDedupe("  SEND Credentials  "), "send credentials");
  });
});

describe("dedupeBlockedWaiting", () => {
  it("collapses the real 'Send CPQ Discord Credentials [to Daniel]' duplicate", () => {
    const items = [
      { title: "Send CPQ Discord Credentials to Daniel", jiraKey: null },
      { title: "Send CPQ Discord Credentials", jiraKey: null },
    ];
    const result = dedupeBlockedWaiting(items);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "Send CPQ Discord Credentials to Daniel");
  });

  it("collapses exact-title duplicates (e.g. same epic extracted twice)", () => {
    const items = [
      { title: "Groom Content File Manager Frontend Epic", jiraKey: null },
      { title: "Groom Content File Manager Frontend Epic", jiraKey: null },
    ];
    assert.equal(dedupeBlockedWaiting(items).length, 1);
  });

  it("keeps genuinely different tasks separate", () => {
    const items = [
      { title: "Send CPQ Discord Credentials to Daniel", jiraKey: null },
      { title: "Review UATL-367 design", jiraKey: null },
    ];
    assert.equal(dedupeBlockedWaiting(items).length, 2);
  });

  it("prefers the jiraKey as the dedupe key when present", () => {
    const items = [
      { title: "Fix the login bug", jiraKey: "UATL-1" },
      { title: "Fix login bug (dup wording)", jiraKey: "UATL-1" },
    ];
    assert.equal(dedupeBlockedWaiting(items).length, 1);
  });
});
