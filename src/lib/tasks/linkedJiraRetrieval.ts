import { extractJiraKeysFromText } from "@/lib/tasks/transcriptTaskMerge";
import { jiraCanonicalKey } from "@/lib/tasks/canonicalKey";

const BROWSE_URL_PATTERN =
  /https?:\/\/([a-z0-9.-]+)\/browse\/([A-Z][A-Z0-9]+-\d+)/gi;

export type LinkedJiraRef = {
  issueKey: string;
  siteHost: string | null;
  canonicalKey: string;
  relation: "references" | "clarifies";
};

export type LinkedJiraResolution =
  | {
      issueKey: string;
      status: "loaded";
      sourceItemId: number;
      canonicalKey: string;
      relation: LinkedJiraRef["relation"];
    }
  | {
      issueKey: string;
      status: "missing";
      canonicalKey: string;
      relation: LinkedJiraRef["relation"];
      missingEvidence: string;
    };

const MAX_LINKS_PER_SOURCE = 3;

/**
 * Parse depth-1 Jira links from description/comments text.
 * Excludes the parent issue key itself.
 */
export function parseLinkedJiraRefs(input: {
  text: string;
  parentIssueKey?: string | null;
  defaultSite?: string | null;
}): LinkedJiraRef[] {
  const parent = input.parentIssueKey?.toUpperCase() ?? null;
  const byKey = new Map<string, LinkedJiraRef>();

  for (const match of input.text.matchAll(BROWSE_URL_PATTERN)) {
    const host = match[1]?.toLowerCase() ?? null;
    const issueKey = match[2].toUpperCase();
    if (parent && issueKey === parent) continue;
    if (byKey.has(issueKey)) continue;
    byKey.set(issueKey, {
      issueKey,
      siteHost: host,
      canonicalKey: jiraCanonicalKey(issueKey, host ?? input.defaultSite),
      relation: "clarifies",
    });
  }

  for (const issueKey of extractJiraKeysFromText(input.text)) {
    if (parent && issueKey === parent) continue;
    if (byKey.has(issueKey)) continue;
    byKey.set(issueKey, {
      issueKey,
      siteHost: null,
      canonicalKey: jiraCanonicalKey(issueKey, input.defaultSite),
      relation: "references",
    });
  }

  return [...byKey.values()].slice(0, MAX_LINKS_PER_SOURCE);
}

export function resolveLinkedJiraEvidence(input: {
  refs: LinkedJiraRef[];
  sources: {
    id: number;
    sourceType: string;
    sourceExternalId: string | null;
    body: string;
  }[];
}): LinkedJiraResolution[] {
  return input.refs.map((ref) => {
    const loaded = input.sources.find(
      (source) =>
        source.sourceType === "jira" &&
        source.sourceExternalId?.toUpperCase() === ref.issueKey &&
        source.body.trim().length > 0
    );
    if (loaded) {
      return {
        issueKey: ref.issueKey,
        status: "loaded" as const,
        sourceItemId: loaded.id,
        canonicalKey: ref.canonicalKey,
        relation: ref.relation,
      };
    }
    return {
      issueKey: ref.issueKey,
      status: "missing" as const,
      canonicalKey: ref.canonicalKey,
      relation: ref.relation,
      missingEvidence: `${ref.issueKey} comment`,
    };
  });
}
