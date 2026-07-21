/**
 * Target DailyBriefV2 shape — used by characterization / acceptance tests.
 * Full composer lands in a later package; this locks the contract early.
 */

export type CitedClaim = {
  text: string;
  evidenceIds: number[];
  kind: "fact" | "recommendation" | "unknown";
};

export type DailyWorkItemTarget = {
  title: string;
  jiraKey: string | null;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  evidenceIds: number[];
  kind: "fact" | "recommendation" | "unknown";
};

export type DailyBriefV2Target = {
  dayChange: CitedClaim | null;
  todayFirst: DailyWorkItemTarget;
  afterThat: DailyWorkItemTarget[];
  sourceConflicts: { summary: string; evidenceIds: number[] }[];
  todayMeetings: { title: string; questions: string[] }[];
  meetingPrep: { meetingTitle: string; questions: string[]; relatedJiraKeys: string[] }[];
  blockedWaiting: { title: string; jiraKey: string | null; reason: string }[];
  reviewReadiness: {
    verified: boolean;
    checklist: string[];
    warning: string | null;
  } | null;
  knowledgeHighlights: CitedClaim[];
  keySources: { label: string; url: string | null }[];
  coverageWarnings: { code: string; message: string }[];
  generatedAt: string;
  inputHash: string;
};

/** Expected Jul 20 brief decisions — citations and structure, not LLM prose. */
export const JUL20_DAILY_BRIEF_V2_TARGET: Omit<
  DailyBriefV2Target,
  "generatedAt" | "inputHash" | "todayFirst" | "afterThat"
> & {
  todayFirst: Pick<DailyWorkItemTarget, "jiraKey" | "kind"> & {
    clarifyFirstAllowed: boolean;
  };
  afterThatKeys: string[];
} = {
  dayChange: {
    text: "UATL-376 newly assigned to Milos Dostanic",
    evidenceIds: [501],
    kind: "fact",
  },
  todayFirst: {
    jiraKey: "UATL-376",
    kind: "unknown",
    clarifyFirstAllowed: true,
  },
  afterThatKeys: [],
  sourceConflicts: [
    {
      summary: "Transcript still treats UATL-367 Canvas as open work while Jira is Done",
      evidenceIds: [502, 504],
    },
  ],
  todayMeetings: [{ title: "Hydra Daily", questions: [] }],
  meetingPrep: [
    {
      meetingTitle: "Hydra Daily",
      questions: [
        "What is the exact header prominence scope for UATL-376?",
        "What decision is still open on UATL-233?",
      ],
      relatedJiraKeys: ["UATL-376", "UATL-233"],
    },
  ],
  blockedWaiting: [
    {
      title: "UATL-233 · Cross-module guidance follow-up",
      jiraKey: "UATL-233",
      reason: "Scope/owner decision unclear",
    },
  ],
  reviewReadiness: {
    verified: false,
    checklist: [
      "Linked Figma node identified",
      "Review comments loaded",
      "Visual findings recorded",
    ],
    warning: "not verified",
  },
  knowledgeHighlights: [],
  keySources: [
    { label: "UATL-376", url: "https://example.atlassian.net/browse/UATL-376" },
    { label: "Hydra Daily", url: "https://notes.example/granola/hydra-daily" },
  ],
  coverageWarnings: [
    {
      code: "missing_linked_jira",
      message: "CON-220 comment not loaded — do not invent scope",
    },
    {
      code: "figma_not_verified",
      message: "Figma file link present without comments/node audit",
    },
  ],
};
