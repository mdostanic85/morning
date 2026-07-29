/**
 * Deterministic "where is the deliverable" resolution for a task.
 *
 * A link to the actual artifact — a pinned Figma frame, a GitHub PR — is
 * usually not in the task's own wording. It sits in the Jira description, in a
 * comment someone left on the ticket, or in a Figma comment. Task evidence only
 * stores a short quote per source, so scanning quotes alone misses those links
 * entirely and the delivery review then has nothing to check the outcomes
 * against.
 *
 * This scans the full body of every source the task cites, keeps track of where
 * each link came from, and prefers the newest node-pinned link. No LLM: a URL
 * either appears in the evidence or it does not.
 */

import { parseFigmaUrl } from "@/lib/connectors/figmaUrl";

const URL_PATTERN = /https?:\/\/[^\s<>")\]]+/gi;
const GITHUB_PULL_PATTERN =
  /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)/i;
const GITHUB_REPO_PATTERN =
  /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(?:$|[/?#])/i;

/** Where a resolved link was found, so the task can explain itself. */
export interface DeliveryLinkOrigin {
  from: "task" | "evidence_quote" | "source_body" | "source_url";
  sourceItemId: number | null;
  sourceTitle: string | null;
  sourceDate: string | null;
}

export interface ResolvedDeliveryLinks {
  figmaFrameUrl: string | null;
  figmaFrameOrigin: DeliveryLinkOrigin | null;
  /** `owner/repo`, usable as `task.githubRepo`. */
  githubRepo: string | null;
  githubPullRequestUrl: string | null;
  githubOrigin: DeliveryLinkOrigin | null;
}

export interface DeliveryLinkTaskInput {
  title: string;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  figmaFrameUrl?: string | null;
  githubRepo?: string | null;
}

export interface DeliveryLinkEvidenceInput {
  sourceItemId: number;
  quote: string | null;
  summary: string;
  url: string | null;
}

export interface DeliveryLinkSourceInput {
  id: number;
  title: string;
  body: string;
  url: string | null;
  sourceDate: string;
}

interface LinkCandidate {
  url: string;
  origin: DeliveryLinkOrigin;
}

function urlsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(URL_PATTERN) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;:]+$/, ""))));
}

/** Newest source first; task-authored text last, since it is the least specific. */
function byNewestSource(a: LinkCandidate, b: LinkCandidate): number {
  const aTime = a.origin.sourceDate ? Date.parse(a.origin.sourceDate) : NaN;
  const bTime = b.origin.sourceDate ? Date.parse(b.origin.sourceDate) : NaN;
  const aValid = Number.isFinite(aTime);
  const bValid = Number.isFinite(bTime);
  if (aValid && bValid && aTime !== bTime) return bTime - aTime;
  if (aValid !== bValid) return aValid ? -1 : 1;
  return 0;
}

function collectCandidates(input: {
  task: DeliveryLinkTaskInput;
  evidence: DeliveryLinkEvidenceInput[];
  sources: DeliveryLinkSourceInput[];
}): LinkCandidate[] {
  const citedSourceIds = new Set(input.evidence.map((item) => item.sourceItemId));
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const candidates: LinkCandidate[] = [];

  for (const evidence of input.evidence) {
    const source = sourceById.get(evidence.sourceItemId) ?? null;
    const origin = (from: DeliveryLinkOrigin["from"]): DeliveryLinkOrigin => ({
      from,
      sourceItemId: evidence.sourceItemId,
      sourceTitle: source?.title ?? null,
      sourceDate: source?.sourceDate ?? null,
    });
    for (const url of [
      ...urlsIn(evidence.quote),
      ...urlsIn(evidence.summary),
      ...urlsIn(evidence.url),
    ]) {
      candidates.push({ url, origin: origin("evidence_quote") });
    }
  }

  for (const source of input.sources) {
    if (!citedSourceIds.has(source.id)) continue;
    const origin = (from: DeliveryLinkOrigin["from"]): DeliveryLinkOrigin => ({
      from,
      sourceItemId: source.id,
      sourceTitle: source.title,
      sourceDate: source.sourceDate,
    });
    for (const url of urlsIn(source.body)) {
      candidates.push({ url, origin: origin("source_body") });
    }
    for (const url of urlsIn(source.url)) {
      candidates.push({ url, origin: origin("source_url") });
    }
  }

  const taskOrigin: DeliveryLinkOrigin = {
    from: "task",
    sourceItemId: null,
    sourceTitle: null,
    sourceDate: null,
  };
  for (const text of [
    input.task.title,
    input.task.reason,
    input.task.nextAction,
    ...input.task.doneCriteria,
  ]) {
    for (const url of urlsIn(text)) {
      candidates.push({ url, origin: taskOrigin });
    }
  }

  return candidates.sort(byNewestSource);
}

function pickFigmaFrame(
  candidates: LinkCandidate[],
  storedFrameUrl: string | null | undefined
): { url: string | null; origin: DeliveryLinkOrigin | null } {
  const stored = storedFrameUrl?.trim() || null;
  // A stored frame that already points at a specific node stays put — the
  // review is only meaningful against one frame, and churning it every sync
  // would invalidate the outcome history.
  if (stored && parseFigmaUrl(stored)?.nodeId) {
    return { url: stored, origin: null };
  }

  const figma = candidates.filter((candidate) => parseFigmaUrl(candidate.url) != null);
  const pinned = figma.find((candidate) => parseFigmaUrl(candidate.url)?.nodeId);
  if (pinned) return { url: pinned.url, origin: pinned.origin };
  if (stored) return { url: stored, origin: null };
  const anyFigma = figma[0];
  return anyFigma ? { url: anyFigma.url, origin: anyFigma.origin } : { url: null, origin: null };
}

function pickGitHub(
  candidates: LinkCandidate[],
  storedRepo: string | null | undefined
): { repo: string | null; pullRequestUrl: string | null; origin: DeliveryLinkOrigin | null } {
  const pull = candidates.find((candidate) => GITHUB_PULL_PATTERN.test(candidate.url));
  if (pull) {
    const match = pull.url.match(GITHUB_PULL_PATTERN)!;
    return {
      repo: `${match[1]}/${match[2]}`,
      pullRequestUrl: pull.url,
      origin: pull.origin,
    };
  }

  const stored = storedRepo?.trim() || null;
  if (stored) return { repo: stored, pullRequestUrl: null, origin: null };

  const repo = candidates.find((candidate) => GITHUB_REPO_PATTERN.test(candidate.url));
  if (repo) {
    const match = repo.url.match(GITHUB_REPO_PATTERN)!;
    return {
      repo: `${match[1]}/${match[2]}`,
      pullRequestUrl: null,
      origin: repo.origin,
    };
  }

  return { repo: null, pullRequestUrl: null, origin: null };
}

export function resolveTaskDeliveryLinks(input: {
  task: DeliveryLinkTaskInput;
  evidence: DeliveryLinkEvidenceInput[];
  sources: DeliveryLinkSourceInput[];
}): ResolvedDeliveryLinks {
  const candidates = collectCandidates(input);
  const figma = pickFigmaFrame(candidates, input.task.figmaFrameUrl);
  const github = pickGitHub(candidates, input.task.githubRepo);

  return {
    figmaFrameUrl: figma.url,
    figmaFrameOrigin: figma.origin,
    githubRepo: github.repo,
    githubPullRequestUrl: github.pullRequestUrl,
    githubOrigin: github.origin,
  };
}

/** Human-readable provenance for a resolved link, e.g. for review report meta. */
export function describeDeliveryLinkOrigin(origin: DeliveryLinkOrigin | null): string | null {
  if (!origin) return null;
  const where =
    origin.from === "source_body"
      ? "source body"
      : origin.from === "source_url"
        ? "source link"
        : origin.from === "evidence_quote"
          ? "evidence quote"
          : "task record";
  return origin.sourceTitle ? `${where} — ${origin.sourceTitle}` : where;
}
