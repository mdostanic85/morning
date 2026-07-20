import type { ConnectorSourceCandidate } from "@/lib/connectors/types";
import { maxIsoTimestamp } from "./connectionCursorUtils";

export function isoToJiraJqlDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16).replace("T", " ");
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function buildJiraUpdatedClause(updatedSinceIso: string): string {
  return `updated >= "${isoToJiraJqlDateTime(updatedSinceIso)}"`;
}

export function observedJiraLastSeenUpdatedAt(
  candidates: ConnectorSourceCandidate[]
): string | null {
  const issueUpdates = candidates.map((candidate) => candidate.sourceDate);
  const commentUpdates = candidates.flatMap((candidate) => {
    const comments = candidate.metadata?.commentUpdatedAts;
    return Array.isArray(comments)
      ? comments.filter((value): value is string => typeof value === "string")
      : [];
  });
  return maxIsoTimestamp(...issueUpdates, ...commentUpdates);
}

export function isoToGmailAfterDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10).replaceAll("-", "/");
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}`;
}
