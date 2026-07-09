import type { SourceItem } from "@/domain/sourceItem";
import type { JiraPendingSnapshot } from "@/lib/connectors/jiraPending";
import { cleanJiraText, extractJiraDescription } from "@/lib/connectors/jiraText";
import type { BriefingFocusItemDraft } from "@/lib/tasks/priorityRank";
import type { WorkTaskForRanking } from "@/lib/tasks/priorityRank";

const SOURCE_EXCERPT_MAX = 2200;
const MAX_SOURCES_PER_ITEM = 8;

export interface FocusEvidenceSource {
  sourceType: string;
  title: string;
  url: string | null;
  excerpt: string;
}

function excerpt(text: string, max = SOURCE_EXCERPT_MAX): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

function uniqueUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>")\]]+/gi) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;]+$/, ""))));
}

function confluencePageIdFromUrl(url: string): string | null {
  return url.match(/\/pages\/(\d+)/)?.[1] ?? null;
}

function figmaFileKeyFromUrl(url: string): string | null {
  return url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/)?.[1] ?? null;
}

function figmaNodeFromUrl(url: string): string | null {
  const match = url.match(/node-id=([^&]+)/);
  return match?.[1]?.replace(/-/g, ":") ?? null;
}

function findConfluenceSource(pageId: string, sources: SourceItem[]): SourceItem | undefined {
  return sources.find(
    (item) =>
      item.sourceType === "confluence" &&
      (item.url?.includes(`/pages/${pageId}`) ||
        item.sourceExternalId === pageId ||
        item.body.includes(`/pages/${pageId}`))
  );
}

function findFigmaSource(fileKey: string, sources: SourceItem[]): SourceItem | undefined {
  return sources.find(
    (item) =>
      item.sourceType === "figma" &&
      (item.url?.includes(fileKey) ||
        item.sourceExternalId === fileKey ||
        item.body.includes(fileKey))
  );
}

function findJiraSource(key: string, sources: SourceItem[]): SourceItem | undefined {
  return sources.find(
    (item) => item.sourceType === "jira" && item.sourceExternalId?.toUpperCase() === key.toUpperCase()
  );
}

function pushSource(
  bucket: FocusEvidenceSource[],
  seen: Set<string>,
  source: FocusEvidenceSource
) {
  const key = `${source.sourceType}:${source.url ?? source.title}`;
  if (seen.has(key)) return;
  seen.add(key);
  bucket.push(source);
}

export function buildFocusEvidenceBundle(input: {
  focusItem: BriefingFocusItemDraft;
  task?: WorkTaskForRanking;
  jiraIssue?: JiraPendingSnapshot;
  sourceItems: SourceItem[];
}): FocusEvidenceSource[] {
  const { focusItem, task, jiraIssue, sourceItems } = input;
  const bundle: FocusEvidenceSource[] = [];
  const seen = new Set<string>();

  const textParts = [
    focusItem.reason,
    focusItem.nextAction,
    ...focusItem.evidenceQuotes.map((entry) => entry.quote),
    task?.reason ?? "",
    task?.nextAction ?? "",
    ...(task?.evidence.map((entry) => `${entry.quote ?? ""} ${entry.summary}`) ?? []),
    jiraIssue?.excerpt ?? "",
  ];

  const jiraKey = focusItem.linkedJiraKey ?? jiraIssue?.key ?? null;
  if (jiraKey) {
    const jiraSource = findJiraSource(jiraKey, sourceItems);
    if (jiraSource) {
      const description = extractJiraDescription(jiraSource.body);
      pushSource(bundle, seen, {
        sourceType: "jira",
        title: jiraSource.title,
        url: jiraSource.url,
        excerpt: excerpt(
          [jiraSource.body.split("\nDescription:")[0], description].filter(Boolean).join("\n\n")
        ),
      });
      textParts.push(jiraSource.body);
    } else if (jiraIssue) {
      pushSource(bundle, seen, {
        sourceType: "jira",
        title: `${jiraKey}: ${jiraIssue.title}`,
        url: jiraIssue.url,
        excerpt: excerpt(jiraIssue.excerpt || jiraIssue.title),
      });
    }
  }

  const allUrls = textParts.flatMap(uniqueUrls);
  for (const url of allUrls) {
    const pageId = confluencePageIdFromUrl(url);
    if (pageId) {
      const match = findConfluenceSource(pageId, sourceItems);
      pushSource(bundle, seen, {
        sourceType: "confluence",
        title: match?.title ?? `Confluence page ${pageId}`,
        url: match?.url ?? url,
        excerpt: excerpt(match?.body ? cleanJiraText(match.body) : `Linked PRD/doc: ${url}`),
      });
      continue;
    }

    const figmaKey = figmaFileKeyFromUrl(url);
    if (figmaKey) {
      const match = findFigmaSource(figmaKey, sourceItems);
      const node = figmaNodeFromUrl(url);
      pushSource(bundle, seen, {
        sourceType: "figma",
        title: match?.title ?? `Figma file ${figmaKey}`,
        url: match?.url ?? url,
        excerpt: excerpt(
          match?.body
            ? cleanJiraText(match.body)
            : `Figma design linked${node ? ` — focus node ${node}` : ""}. Open the file to inspect the referenced screen or flow.`
        ),
      });
    }
  }

  for (const item of sourceItems) {
    if (bundle.length >= MAX_SOURCES_PER_ITEM) break;
    if (item.sourceType !== "confluence" && item.sourceType !== "granola") continue;
    const haystack = `${focusItem.title} ${jiraKey ?? ""}`.toLowerCase();
    const titleMatch = item.title.toLowerCase();
    if (
      haystack.includes("prototype") &&
      (titleMatch.includes("prd") || titleMatch.includes("cross-module") || titleMatch.includes("guidance"))
    ) {
      pushSource(bundle, seen, {
        sourceType: item.sourceType,
        title: item.title,
        url: item.url,
        excerpt: excerpt(cleanJiraText(item.body)),
      });
    }
  }

  return bundle.slice(0, MAX_SOURCES_PER_ITEM);
}
