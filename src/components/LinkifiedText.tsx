import type { ReactNode } from "react";
import { ExternalLinkIcon } from "lucide-react";

const URL_PATTERN = /(https?:\/\/[^\s<>()[\]"']+)/gi;

export interface LinkifyOptions {
  referenceLinks?: { label: string; url: string }[];
  jiraUrl?: string | null;
  jiraKey?: string | null;
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline-offset-2 [overflow-wrap:anywhere] hover:underline"
    >
      {children}
      <ExternalLinkIcon
        className="ml-0.5 inline-block size-3 shrink-0 align-[-1px]"
        aria-hidden
      />
    </a>
  );
}

function linkifySegment(
  text: string,
  options: LinkifyOptions,
  keyPrefix: string
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const labels = [...(options.referenceLinks ?? [])].sort(
    (a, b) => b.label.length - a.label.length
  );

  let cursor = 0;
  let partIndex = 0;

  while (cursor < text.length) {
    let nextMatch: { index: number; length: number; node: ReactNode } | null = null;

    const urlMatch = URL_PATTERN.exec(text.slice(cursor));
    URL_PATTERN.lastIndex = 0;
    if (urlMatch?.index != null) {
      const index = cursor + urlMatch.index;
      const url = urlMatch[0].replace(/[.,;:!?)]+$/, "");
      nextMatch = {
        index,
        length: url.length,
        node: <ExternalLink href={url}>{url}</ExternalLink>,
      };
    }

    for (const link of labels) {
      const labelIndex = text.indexOf(link.label, cursor);
      if (labelIndex === -1) continue;
      if (!nextMatch || labelIndex < nextMatch.index) {
        nextMatch = {
          index: labelIndex,
          length: link.label.length,
          node: <ExternalLink href={link.url}>{link.label}</ExternalLink>,
        };
      }
    }

    if (options.jiraKey && options.jiraUrl) {
      const jiraRegex = new RegExp(`\\b${options.jiraKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      const jiraMatch = jiraRegex.exec(text.slice(cursor));
      if (jiraMatch?.index != null) {
        const index = cursor + jiraMatch.index;
        if (!nextMatch || index < nextMatch.index) {
          nextMatch = {
            index,
            length: options.jiraKey.length,
            node: <ExternalLink href={options.jiraUrl}>{options.jiraKey}</ExternalLink>,
          };
        }
      }
    }

    if (!nextMatch) {
      nodes.push(text.slice(cursor));
      break;
    }

    if (nextMatch.index > cursor) {
      nodes.push(text.slice(cursor, nextMatch.index));
    }

    nodes.push(
      <span key={`${keyPrefix}-${partIndex}`}>{nextMatch.node}</span>
    );
    partIndex += 1;
    cursor = nextMatch.index + nextMatch.length;
  }

  return nodes;
}

export function linkifyText(text: string, options: LinkifyOptions = {}): ReactNode[] {
  if (!text.trim()) return [text];
  return linkifySegment(text, options, "link");
}

export function LinkifiedText({
  text,
  className,
  ...options
}: LinkifyOptions & { text: string; className?: string }) {
  return <span className={className}>{linkifyText(text, options)}</span>;
}

export function resolveJiraUrl(input: {
  linkedJiraUrl?: string | null;
  linkedJiraKey?: string | null;
  evidence?: { sourceType?: string; sourceUrl?: string | null }[];
}): string | null {
  if (input.linkedJiraUrl) return input.linkedJiraUrl;
  const fromEvidence = input.evidence?.find(
    (entry) => entry.sourceType === "jira" && entry.sourceUrl
  );
  return fromEvidence?.sourceUrl ?? null;
}

export function referenceLinksNotInText(
  textBlocks: string[],
  referenceLinks: { label: string; url: string }[] | undefined
): { label: string; url: string }[] {
  if (!referenceLinks?.length) return [];
  const haystack = textBlocks.join("\n").toLowerCase();
  return referenceLinks.filter((link) => !haystack.includes(link.label.toLowerCase()));
}
