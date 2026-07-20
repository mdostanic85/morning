import "server-only";

import { textMentionsPerson } from "@/lib/granola/personalKnowledge";
import { getSourceItems } from "@/services/sourceItems";
import { getUserProfile } from "@/services/userProfile";

const MENTION_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const MEETING_SOURCE_TYPES = new Set(["granola", "gmail", "drive", "manual_transcript"]);

export interface PersonalMentionSignal {
  id: string;
  kind: "meeting" | "jira";
  title: string;
  excerpt: string;
  sourceDate: string;
  url: string | null;
  sourceLabel: string;
}

function excerptAroundMention(body: string, myName: string): string {
  const lowered = body.toLowerCase();
  const needles = [myName.trim().toLowerCase(), myName.trim().toLowerCase().split(/\s+/)[0]].filter(
    (part) => part.length >= 3
  );
  let index = -1;
  for (const needle of needles) {
    index = lowered.indexOf(needle);
    if (index >= 0) break;
  }
  if (index < 0) {
    return body.replace(/\s+/g, " ").trim().slice(0, 160);
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(body.length, index + 120);
  const slice = body.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${end < body.length ? "…" : ""}`;
}

function sourceLabel(sourceType: string): string {
  switch (sourceType) {
    case "granola":
      return "Granola";
    case "gmail":
      return "Gmail / Meet notes";
    case "drive":
      return "Drive notes";
    case "manual_transcript":
      return "Transcript";
    case "jira":
      return "Jira";
    default:
      return sourceType;
  }
}

export async function getPersonalMentionSignals(): Promise<{
  meetings: PersonalMentionSignal[];
  jiraTagged: PersonalMentionSignal[];
}> {
  const profile = await getUserProfile();
  const myName = profile?.name?.trim() ?? "";
  if (!myName) {
    return { meetings: [], jiraTagged: [] };
  }

  const cutoff = Date.now() - MENTION_LOOKBACK_MS;
  const sources = await getSourceItems();

  const meetings: PersonalMentionSignal[] = [];
  const jiraTagged: PersonalMentionSignal[] = [];

  for (const item of sources) {
    const sourceMs = Date.parse(item.sourceDate);
    if (!Number.isFinite(sourceMs) || sourceMs < cutoff) continue;

    if (MEETING_SOURCE_TYPES.has(item.sourceType)) {
      if (!textMentionsPerson(`${item.title}\n${item.body}`, myName)) continue;
      meetings.push({
        id: `meeting-${item.id}`,
        kind: "meeting",
        title: item.title,
        excerpt: excerptAroundMention(item.body, myName),
        sourceDate: item.sourceDate,
        url: item.url,
        sourceLabel: sourceLabel(item.sourceType),
      });
      continue;
    }

    if (item.sourceType === "jira" && item.metadata?.involvement === "mentioned") {
      jiraTagged.push({
        id: `jira-${item.id}`,
        kind: "jira",
        title: item.title,
        excerpt: excerptAroundMention(item.body, myName),
        sourceDate: item.sourceDate,
        url: item.url,
        sourceLabel: "Jira mention",
      });
    }
  }

  const byDateDesc = (a: PersonalMentionSignal, b: PersonalMentionSignal) =>
    Date.parse(b.sourceDate) - Date.parse(a.sourceDate);

  return {
    meetings: meetings.sort(byDateDesc).slice(0, 6),
    jiraTagged: jiraTagged.sort(byDateDesc).slice(0, 6),
  };
}
