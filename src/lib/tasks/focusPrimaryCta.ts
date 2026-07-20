import type { WorkTaskStatus } from "@/domain/workTask";

export interface FocusCtaInput {
  status?: WorkTaskStatus;
  figmaFrameUrl?: string | null;
  githubRepo?: string | null;
  localRepoPath?: string | null;
  linkedJiraUrl?: string | null;
  referenceLinks?: { label: string; url: string }[];
}

export interface FocusPrimaryCta {
  label: string;
  href: string | null;
  scrollTargetId?: string;
}

function linkMatching(links: { label: string; url: string }[], pattern: RegExp): string | null {
  for (const link of links) {
    const haystack = `${link.label} ${link.url}`.toLowerCase();
    if (pattern.test(haystack)) return link.url;
  }
  return null;
}

export function resolveFocusPrimaryCta(input: FocusCtaInput): FocusPrimaryCta {
  const links = input.referenceLinks ?? [];
  const figmaUrl =
    input.figmaFrameUrl ??
    linkMatching(links, /figma/) ??
    null;
  const githubUrl =
    linkMatching(links, /github/) ??
    (input.githubRepo ? `https://github.com/${input.githubRepo}` : null);
  const jiraUrl = input.linkedJiraUrl ?? linkMatching(links, /jira|atlassian/);

  if (figmaUrl) {
    return { label: "Open in Figma", href: figmaUrl };
  }
  if (githubUrl) {
    return { label: "Open in GitHub", href: githubUrl };
  }
  if (jiraUrl) {
    return { label: "Open in Jira", href: jiraUrl };
  }

  if (input.status === "now") {
    return { label: "Continue work", href: null, scrollTargetId: "redosled" };
  }

  return { label: "Start work", href: null, scrollTargetId: "redosled" };
}

export function resolveFocusSecondaryActions(input: FocusCtaInput): { label: string; href: string }[] {
  const actions: { label: string; href: string }[] = [];
  const seen = new Set<string>();
  const add = (label: string, href: string | null | undefined) => {
    if (!href || seen.has(href)) return;
    seen.add(href);
    actions.push({ label, href });
  };

  add("Open Jira", input.linkedJiraUrl ?? linkMatching(input.referenceLinks ?? [], /jira|atlassian/));
  add("Open Figma", input.figmaFrameUrl ?? linkMatching(input.referenceLinks ?? [], /figma/));
  add(
    "Open GitHub",
    linkMatching(input.referenceLinks ?? [], /github/) ??
      (input.githubRepo ? `https://github.com/${input.githubRepo}` : null)
  );

  return actions;
}
