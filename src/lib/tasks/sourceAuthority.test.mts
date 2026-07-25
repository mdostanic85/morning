import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareSourceAuthority,
  filterFreshTaskSources,
  hasHighAuthorityStakeholderInstruction,
  isIncomingSourceAuthoritative,
  isRecentAttendedTranscript,
  isSyncMyDayProvider,
  isTranscriptSource,
  looksLikePrdTitle,
  sourceAuthorityScoreBoost,
  userAttendedTranscript,
  SYNC_PROVIDER_WAVES,
} from "./sourceAuthority";

describe("sourceAuthority", () => {
  it("orders sync waves confluence → jira → transcripts → rest", () => {
    assert.deepEqual([...SYNC_PROVIDER_WAVES[0]], ["confluence"]);
    assert.deepEqual([...SYNC_PROVIDER_WAVES[1]], ["jira"]);
    assert.deepEqual([...SYNC_PROVIDER_WAVES[2]], ["granola", "gmail"]);
  });

  it("uses Gmail as the single Gemini Notes sync provider", () => {
    assert.equal(isSyncMyDayProvider("gmail"), true);
    assert.equal(isSyncMyDayProvider("drive"), false);
  });

  it("detects granola, drive, and gemini meet notes as transcripts", () => {
    assert.equal(isTranscriptSource({ sourceType: "granola" }), true);
    assert.equal(isTranscriptSource({ sourceType: "drive" }), true);
    assert.equal(
      isTranscriptSource({
        sourceType: "gmail",
        title: "Notes: Lucas & Milos Sync",
        metadata: { importedFrom: "gmail_gemini_meet_notes" },
      }),
      true
    );
    assert.equal(isTranscriptSource({ sourceType: "confluence", title: "PRD" }), false);
  });

  it("does not treat calendar invites as transcripts", () => {
    assert.equal(
      isTranscriptSource({
        sourceType: "gmail",
        title: "Invitation: Hydra Design Catch Up @ Tue Apr 14, 2026",
        metadata: { importedFrom: "gmail_gemini_meet_notes" },
      }),
      false
    );
    assert.equal(
      isTranscriptSource({
        sourceType: "gmail",
        title: "Canceled event with note: Design Team meeting",
        metadata: { importedFrom: "gmail_gemini_meet_notes" },
      }),
      false
    );
  });

  it("auto-detects PRD titles", () => {
    assert.equal(looksLikePrdTitle("Hydra PRD — Cross Module"), true);
    assert.equal(looksLikePrdTitle("Product Requirements Document"), true);
    assert.equal(looksLikePrdTitle("Weekly standup notes"), false);
  });

  it("detects Matt/Lucas instructions in transcript text", () => {
    assert.equal(
      hasHighAuthorityStakeholderInstruction({
        author: null,
        title: "Design sync",
        body: "Matt said please fix the nav labels before Friday.",
      }),
      true
    );
    assert.equal(
      hasHighAuthorityStakeholderInstruction({
        author: "Lucas",
        title: "Sync",
        body: "Update the CTA copy.",
      }),
      true
    );
  });

  it("lets newest date win when no stakeholder instruction", () => {
    const olderTranscript = {
      sourceType: "granola" as const,
      sourceDate: "2026-07-10T10:00:00.000Z",
      title: "Old sync",
      body: "Please use blue buttons",
      url: null,
      metadata: null,
      author: null,
    };
    const newerJira = {
      sourceType: "jira" as const,
      sourceDate: "2026-07-18T10:00:00.000Z",
      title: "HYD-1",
      body: "Use green buttons",
      url: null,
      metadata: null,
      author: null,
    };
    assert.ok(compareSourceAuthority(newerJira, olderTranscript) > 0);
  });

  it("lets Matt/Lucas transcript beat newer non-stakeholder source", () => {
    const mattTranscript = {
      sourceType: "drive" as const,
      sourceDate: "2026-07-14T10:00:00.000Z",
      title: "Notes by Gemini",
      body: "Lucas said change the CTA to Continue.",
      url: null,
      metadata: { importedFrom: "drive_gemini_notes" },
      author: null,
    };
    const newerJira = {
      sourceType: "jira" as const,
      sourceDate: "2026-07-18T10:00:00.000Z",
      title: "HYD-1",
      body: "CTA should say Next",
      url: null,
      metadata: null,
      author: null,
    };
    assert.ok(compareSourceAuthority(mattTranscript, newerJira) > 0);
    assert.equal(
      isIncomingSourceAuthoritative({
        incoming: mattTranscript,
        existingEvidenceDates: [newerJira.sourceDate],
        existingSources: [newerJira],
      }),
      true
    );
  });

  it("drops task sources older than 5 days vs the newest signal", () => {
    const fresh = { sourceDate: "2026-07-19T10:00:00.000Z", id: "fresh" };
    const withinWindow = { sourceDate: "2026-07-15T10:00:00.000Z", id: "ok" };
    const stale = { sourceDate: "2026-07-10T10:00:00.000Z", id: "stale" };
    const kept = filterFreshTaskSources([fresh, withinWindow, stale]);
    assert.deepEqual(
      kept.map((source) => source.id),
      ["fresh", "ok"]
    );
  });

  it("blocks stale sources from updating a task — even Matt/Lucas transcripts", () => {
    const staleMattTranscript = {
      sourceType: "granola" as const,
      sourceDate: "2026-07-05T10:00:00.000Z",
      title: "Old sync",
      body: "Matt said use the old layout.",
      url: null,
      metadata: null,
      author: null,
    };
    assert.equal(
      isIncomingSourceAuthoritative({
        incoming: staleMattTranscript,
        existingEvidenceDates: ["2026-07-18T10:00:00.000Z"],
        existingSources: [
          {
            sourceType: "jira",
            sourceDate: "2026-07-18T10:00:00.000Z",
            title: "HYD-1",
            body: "New layout in progress",
            url: null,
            metadata: null,
            author: null,
          },
        ],
      }),
      false
    );
  });

  it("still lets a fresh Matt/Lucas transcript win inside the window", () => {
    assert.equal(
      isIncomingSourceAuthoritative({
        incoming: {
          sourceType: "granola",
          sourceDate: "2026-07-16T10:00:00.000Z",
          title: "Sync",
          body: "Lucas said change the CTA to Continue.",
          url: null,
          metadata: null,
          author: null,
        },
        existingEvidenceDates: ["2026-07-18T10:00:00.000Z"],
        existingSources: [
          {
            sourceType: "jira",
            sourceDate: "2026-07-18T10:00:00.000Z",
            title: "HYD-1",
            body: "CTA says Next",
            url: null,
            metadata: null,
            author: null,
          },
        ],
      }),
      true
    );
  });

  it("treats own Gmail/Drive notes as attended, and Granola by participants", () => {
    assert.equal(
      userAttendedTranscript({ sourceType: "drive", title: "Notes by Gemini" }, {
        myName: "Miloš",
      }),
      true
    );
    assert.equal(
      userAttendedTranscript(
        {
          sourceType: "granola",
          title: "Design sync",
          body: "Participants: Milos Dostanic, Matt",
          metadata: { participants: ["Milos Dostanic", "Matt"] },
        },
        { myName: "Miloš Dostanić" }
      ),
      true
    );
    assert.equal(
      userAttendedTranscript(
        {
          sourceType: "granola",
          title: "Other team sync",
          body: "Participants: Ana, Marko",
          metadata: { participants: ["Ana", "Marko"] },
        },
        { myName: "Miloš" }
      ),
      false
    );
  });

  it("flags a fresh attended transcript as a must-do and force-includes it", () => {
    const attendedGranola = {
      sourceType: "granola" as const,
      sourceDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      title: "Design sync",
      body: "Participants: Milos\nMatt: please redo the empty state.",
      metadata: { participants: ["Milos"] },
      author: null,
    };
    assert.equal(
      isRecentAttendedTranscript(attendedGranola, { myName: "Milos" }),
      true
    );
    const boost = sourceAuthorityScoreBoost([attendedGranola], {
      attendance: { myName: "Milos" },
    });
    assert.equal(boost.forceInclude, true);
    assert.ok(boost.notes.some((note) => /attended in the last 4 days/i.test(note)));
  });

  it("does not force-include an attended transcript older than 4 days", () => {
    const old = {
      sourceType: "granola" as const,
      sourceDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      title: "Old sync",
      body: "Participants: Milos",
      metadata: { participants: ["Milos"] },
      author: null,
    };
    const boost = sourceAuthorityScoreBoost([old], { attendance: { myName: "Milos" } });
    assert.equal(boost.forceInclude, false);
  });

  it("boosts stakeholder transcript tasks in ranking", () => {
    const boost = sourceAuthorityScoreBoost([
      {
        sourceType: "granola",
        sourceDate: new Date().toISOString(),
        title: "Today sync",
        body: "Matt said please ship the prototype today.",
      },
    ]);
    assert.ok(boost.score >= 300);
    assert.ok(boost.notes.some((note) => /Matt or Lucas/i.test(note)));
  });
});
