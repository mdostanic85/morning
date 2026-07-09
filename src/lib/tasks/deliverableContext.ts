import { parseFigmaUrl } from "@/lib/connectors/figmaUrl";

const URL_PATTERN = /https?:\/\/[^\s<>")\]]+/gi;
const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;
const BRANCH_PATTERNS = [
  /\bbranch[:\s]+[`'"]?([a-zA-Z0-9_./-]+)[`'"]?/i,
  /\bon branch\s+[`'"]?([a-zA-Z0-9_./-]+)[`'"]?/i,
  /\bfeature\/([a-zA-Z0-9_.-]+)/i,
];

export function extractJiraKey(title: string): string | null {
  return title.match(JIRA_KEY_PATTERN)?.[1] ?? null;
}

function normalizeUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;]+$/, ""))));
}

export function extractFigmaUrl(texts: string[]): string | null {
  const urls = texts.flatMap(normalizeUrls);
  const figmaUrls = urls.filter((url) => url.includes("figma.com"));
  if (figmaUrls.length === 0) return null;

  const withNode = figmaUrls.find((url) => parseFigmaUrl(url)?.nodeId);
  return withNode ?? figmaUrls[0];
}

export function extractGitBranch(texts: string[], jiraKey?: string | null): string | null {
  for (const text of texts) {
    for (const pattern of BRANCH_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1];
    }
  }

  if (jiraKey) {
    const key = jiraKey.toLowerCase();
    return `feature/${key}`;
  }

  return null;
}

export function collectDeliverableTexts(input: {
  title: string;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  evidenceQuotes: string[];
  referenceLinks?: { label: string; url: string }[];
}): string[] {
  return [
    input.title,
    input.reason,
    input.nextAction,
    ...input.doneCriteria,
    ...input.evidenceQuotes,
    ...(input.referenceLinks?.map((link) => `${link.label} ${link.url}`) ?? []),
  ];
}
