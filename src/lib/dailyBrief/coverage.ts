import type { SourceItem } from "@/domain/sourceItem";
import { parseLinkedJiraRefs, resolveLinkedJiraEvidence } from "@/lib/tasks/linkedJiraRetrieval";

export type CoverageWarning = { code: string; message: string };

export function buildCoverageWarnings(input: {
  sources: Pick<
    SourceItem,
    "id" | "sourceType" | "sourceExternalId" | "title" | "body" | "url" | "metadata"
  >[];
  primaryJiraBodies?: { key: string; body: string }[];
}): CoverageWarning[] {
  const warnings: CoverageWarning[] = [];

  for (const jira of input.primaryJiraBodies ?? []) {
    const refs = parseLinkedJiraRefs({
      text: jira.body,
      parentIssueKey: jira.key,
    });
    const resolved = resolveLinkedJiraEvidence({ refs, sources: input.sources });
    for (const item of resolved) {
      if (item.status === "missing") {
        warnings.push({
          code: "missing_linked_jira",
          message: `${item.missingEvidence} not loaded — do not invent scope`,
        });
      }
    }
  }

  const figmaSources = input.sources.filter((source) => source.sourceType === "figma");
  // Collect the set of file keys that have at least one imported comment row.
  const fileKeysWithComments = new Set<string>();
  for (const source of figmaSources) {
    const externalId = source.sourceExternalId ?? "";
    // Comment rows: "{fileKey}:comment:{commentId}"
    const commentMatch = externalId.match(/^(.+):comment:.+$/);
    if (commentMatch) {
      fileKeysWithComments.add(commentMatch[1]);
      continue;
    }
    // Structure rows that explicitly flagged commentsImported.
    if (source.metadata?.commentsImported === true) {
      const fileKey = source.metadata.fileKey;
      if (typeof fileKey === "string") fileKeysWithComments.add(fileKey);
    }
  }

  for (const figma of figmaSources) {
    const externalId = figma.sourceExternalId ?? "";
    // Only evaluate structure rows here — comment rows are not task sources.
    if (!externalId.endsWith(":structure")) continue;
    const structureFileKey = figma.metadata?.fileKey;
    const commentsImported =
      (typeof structureFileKey === "string" && fileKeysWithComments.has(structureFileKey)) ||
      figma.metadata?.commentsImported === true;
    if (!commentsImported) {
      warnings.push({
        code: "figma_not_verified",
        message: "Figma file link present without comments/node audit",
      });
    }
  }

  const confluenceEmpty = input.sources.filter(
    (source) =>
      source.sourceType === "confluence" &&
      (source.metadata?.fetchStatus === "not_loaded" || !source.body.trim())
  );
  for (const page of confluenceEmpty) {
    warnings.push({
      code: "confluence_incomplete",
      message: `${page.title || page.sourceExternalId || "Confluence page"} not fully loaded`,
    });
  }

  // Dedupe by code+message
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildMeetingPrep(input: {
  meetings: { title: string }[];
  openGaps: {
    jiraKey: string | null;
    question: string;
    evidenceIds: number[];
  }[];
}): {
  meetingTitle: string;
  questions: string[];
  relatedJiraKeys: string[];
  evidenceIds: number[];
}[] {
  const hydraLike = input.meetings.filter((meeting) =>
    /hydra|daily|standup|design/i.test(meeting.title)
  );
  if (hydraLike.length === 0 || input.openGaps.length === 0) return [];

  return hydraLike.slice(0, 2).map((meeting) => {
    const gaps = input.openGaps.slice(0, 5);
    return {
      meetingTitle: meeting.title,
      questions: gaps.map((gap) => gap.question),
      relatedJiraKeys: gaps
        .map((gap) => gap.jiraKey)
        .filter((key): key is string => Boolean(key)),
      evidenceIds: [...new Set(gaps.flatMap((gap) => gap.evidenceIds))],
    };
  });
}
