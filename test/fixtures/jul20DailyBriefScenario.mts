/**
 * Sanitized Jul 20 2026 Hydra Daily scenario.
 * No tokens, emails beyond assignee display names, or full private transcripts.
 */

export const JUL20_TODAY = "2026-07-20";

export const JUL20_MY_NAME = "Milos Dostanic";

/** Expected DailyBriefV2 decision snapshot (target after ranking/composer fix). */
export const JUL20_EXPECTED_BRIEF = {
  dayChange:
    "New Jira assignment: UATL-376 assigned to Milos Dostanic (To Do).",
  todayFirst: {
    jiraKey: "UATL-376",
    /** May be primary work or clarify-first when CON-220 scope is missing. */
    status: "now_or_unclear_clarify_first" as const,
    mustHave: ["evidence", "nextAction", "doneCriteria"] as const,
  },
  afterThatMax: 2,
  notActiveProduction: ["UATL-367"],
  unclearOrWaiting: ["UATL-233"],
  missingEvidence: ["CON-220 comment"],
  meetingPrep: {
    meetingTitle: "Hydra Daily",
    hasQuestions: true,
  },
  reviewReadiness: {
    figmaVerified: false,
    warning: "not verified",
  },
  mustNotInvent: ["CON-220 comment body"],
} as const;

export type Jul20FixtureSource = {
  id: number;
  sourceType: "jira" | "granola" | "figma" | "confluence";
  title: string;
  body: string;
  author: string | null;
  sourceDate: string;
  url: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  projectId: null;
  sourceExternalId: string | null;
};

export type Jul20FixtureTask = {
  id: number;
  projectId: null;
  title: string;
  status: "now" | "next" | "later" | "waiting" | "tomorrow" | "unclear";
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  priorityScore: number | null;
  confidence: number | null;
  dueDate: string | null;
  waitingOn: string | null;
  owner: string | null;
  statusManuallySet: boolean;
  evidence: { sourceItemId: number; quote: string | null; summary: string }[];
};

export type Jul20JiraPending = {
  key: string;
  title: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  dueDate: string | null;
  url: string | null;
  updatedAt: string;
  excerpt: string;
};

const createdAt = "2026-07-20T13:00:00.000Z";

export const jul20Sources: Jul20FixtureSource[] = [
  {
    id: 501,
    projectId: null,
    sourceType: "jira",
    sourceExternalId: "UATL-376",
    title: "UATL-376: Promote Project Name",
    body: [
      "Status: To Do",
      "Priority: Medium",
      "Assignee: Milos Dostanic",
      "",
      "Make the project name more prominent in the header.",
      "See CON-220 for scope details: https://example.atlassian.net/browse/CON-220",
    ].join("\n"),
    author: null,
    sourceDate: "2026-07-20T13:05:00.000Z",
    url: "https://example.atlassian.net/browse/UATL-376",
    metadata: {
      key: "UATL-376",
      status: "To Do",
      priority: "Medium",
      assignee: "Milos Dostanic",
      statusCategoryKey: "new",
    },
    createdAt,
  },
  {
    id: 502,
    projectId: null,
    sourceType: "jira",
    sourceExternalId: "UATL-367",
    title: "UATL-367: DESIGN - Content File Manager - Convert to Canvas",
    body: [
      "Status: Done",
      "Priority: Medium",
      "Assignee: Milos Dostanic",
      "",
      "Convert Content File Manager to Canvas.",
    ].join("\n"),
    author: null,
    sourceDate: "2026-07-20T13:02:00.000Z",
    url: "https://example.atlassian.net/browse/UATL-367",
    metadata: {
      key: "UATL-367",
      status: "Done",
      priority: "Medium",
      assignee: "Milos Dostanic",
      statusCategoryKey: "done",
    },
    createdAt,
  },
  {
    id: 503,
    projectId: null,
    sourceType: "jira",
    sourceExternalId: "UATL-233",
    title: "UATL-233: Cross-module guidance follow-up",
    body: [
      "Status: In Progress",
      "Priority: Medium",
      "Assignee: Milos Dostanic",
      "",
      "Generic follow-up — exact scope not specified in the ticket body.",
    ].join("\n"),
    author: null,
    sourceDate: "2026-07-10T12:00:00.000Z",
    url: "https://example.atlassian.net/browse/UATL-233",
    metadata: {
      key: "UATL-233",
      status: "In Progress",
      priority: "Medium",
      assignee: "Milos Dostanic",
      statusCategoryKey: "indeterminate",
    },
    createdAt,
  },
  {
    id: 504,
    projectId: null,
    sourceType: "granola",
    sourceExternalId: "granola-cfm-review",
    title: "Content File Manager - Review",
    body: [
      "Participants: Milos Dostanic, Design team",
      "Canvas conversion for Content File Manager was the main priority.",
      "Milos: I will finish the remaining Canvas screens for UATL-367.",
    ].join("\n"),
    author: null,
    sourceDate: "2026-07-18T14:00:00.000Z",
    url: "https://notes.example/granola/cfm-review",
    metadata: {
      participants: ["Milos Dostanic", "Design team"],
    },
    createdAt,
  },
  {
    id: 505,
    projectId: null,
    sourceType: "granola",
    sourceExternalId: "granola-hydra-daily",
    title: "Hydra Daily",
    body: [
      "Participants: Milos Dostanic, Matt, Lucas, Sofija",
      "New sprint kicked off.",
      "Content File Manager design finalized — moving to making the project name more prominent in the header.",
    ].join("\n"),
    author: null,
    sourceDate: "2026-07-20T13:00:00.000Z",
    url: "https://notes.example/granola/hydra-daily",
    metadata: {
      participants: ["Milos Dostanic", "Matt", "Lucas", "Sofija"],
    },
    createdAt,
  },
  {
    id: 506,
    projectId: null,
    sourceType: "figma",
    sourceExternalId: "figma-header-file",
    title: "Hydra Header explorations",
    body: "File-level Figma link only. No node comments imported.",
    author: null,
    sourceDate: "2026-07-19T10:00:00.000Z",
    url: "https://www.figma.com/design/exampleFileKey/Hydra-Header",
    metadata: {
      fileKey: "exampleFileKey",
      commentsImported: false,
    },
    createdAt,
  },
  {
    id: 507,
    projectId: null,
    sourceType: "confluence",
    sourceExternalId: "CON-missing",
    title: "CON-220 (linked, not loaded)",
    body: "",
    author: null,
    sourceDate: "2026-07-20T12:00:00.000Z",
    url: "https://example.atlassian.net/browse/CON-220",
    metadata: {
      key: "CON-220",
      fetchStatus: "not_loaded",
      missingEvidence: "CON-220 comment",
    },
    createdAt,
  },
];

/**
 * Open queue tasks as observed after Sync my day on Jul 20 —
 * confidence incorrectly mirrored priorityScore; UATL-367 still open despite Jira Done.
 */
export const jul20Tasks: Jul20FixtureTask[] = [
  {
    id: 430,
    projectId: null,
    title: "UATL-376 · Promote Project Name",
    status: "later",
    reason: "Assigned in Jira today.",
    nextAction: "Open UATL-376 and confirm header prominence scope.",
    doneCriteria: ["Project name prominence change is proposed and linked from UATL-376."],
    priorityScore: 0.156,
    confidence: 0.156,
    dueDate: null,
    waitingOn: null,
    owner: "Milos Dostanic",
    statusManuallySet: false,
    evidence: [
      {
        sourceItemId: 501,
        quote: "Assignee: Milos Dostanic",
        summary: "UATL-376 assigned To Do",
      },
    ],
  },
  {
    id: 431,
    projectId: null,
    title: "UATL-233 · Cross-module guidance follow-up",
    status: "later",
    reason: "Jira In Progress with unclear scope.",
    nextAction: "Clarify the required decision for UATL-233.",
    doneCriteria: ["Decision owner and required outcome are recorded."],
    priorityScore: 0.187,
    confidence: 0.187,
    dueDate: null,
    waitingOn: null,
    owner: "Milos Dostanic",
    statusManuallySet: false,
    evidence: [
      {
        sourceItemId: 503,
        quote: "exact scope not specified",
        summary: "UATL-233 generic scope",
      },
    ],
  },
  {
    id: 432,
    projectId: null,
    title: "UATL-376 · Update Header",
    status: "later",
    reason: "Duplicate extraction of the same Jira assignment.",
    nextAction: "Confirm this is the same work as Promote Project Name.",
    doneCriteria: ["Duplicate merged or closed."],
    priorityScore: 0.136,
    confidence: 0.136,
    dueDate: null,
    waitingOn: null,
    owner: "Milos Dostanic",
    statusManuallySet: false,
    evidence: [
      {
        sourceItemId: 501,
        quote: "Make the project name more prominent",
        summary: "UATL-376 header copy",
      },
    ],
  },
  {
    id: 367,
    projectId: null,
    title: "Finish remaining Content File Manager Canvas screens",
    status: "now",
    reason: "Committed in a recent attended review meeting.",
    nextAction: "Finish remaining Canvas screens discussed in review.",
    doneCriteria: ["Remaining Canvas screens for Content File Manager are complete."],
    priorityScore: 0.9,
    confidence: 0.9,
    dueDate: null,
    waitingOn: null,
    owner: "Milos Dostanic",
    statusManuallySet: false,
    evidence: [
      {
        sourceItemId: 504,
        quote: "I will finish the remaining Canvas screens for UATL-367",
        summary: "Meeting commitment for Canvas",
      },
      {
        sourceItemId: 502,
        quote: "Status: Done",
        summary: "UATL-367 Jira Done",
      },
    ],
  },
];

export const jul20JiraPending: Jul20JiraPending[] = [
  {
    key: "UATL-376",
    title: "Promote Project Name",
    status: "To Do",
    priority: "Medium",
    assignee: "Milos Dostanic",
    dueDate: null,
    url: "https://example.atlassian.net/browse/UATL-376",
    updatedAt: "2026-07-20T13:05:00.000Z",
    excerpt: "Assignee: Milos Dostanic\nStatus: To Do\nPriority: Medium",
  },
  {
    key: "UATL-233",
    title: "Cross-module guidance follow-up",
    status: "In Progress",
    priority: "Medium",
    assignee: "Milos Dostanic",
    dueDate: null,
    url: "https://example.atlassian.net/browse/UATL-233",
    updatedAt: "2026-07-10T12:00:00.000Z",
    excerpt: "Assignee: Milos Dostanic\nStatus: In Progress\nPriority: Medium",
  },
  // UATL-367 is Done — intentionally absent from open Jira pending snapshot.
];

export function jul20SourceById(): Map<number, Jul20FixtureSource> {
  return new Map(jul20Sources.map((source) => [source.id, source]));
}
