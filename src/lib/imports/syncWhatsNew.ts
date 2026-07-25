import type {
  ImportedSourceItem,
  SyncKnowledgeItem,
} from "@/lib/connectors/types";
import {
  knowledgeItemMatchesMe,
} from "@/lib/filters/knowledgeFilter";
import type { JiraDoneNotification } from "@/lib/imports/jiraDoneNotifications";
import type { KnowledgeItemView } from "@/services/knowledgeItems";

export type SyncNotificationKind = "jira_done" | "gemini_knowledge";

export interface SyncNotification {
  kind: SyncNotificationKind;
  title: string;
  detail: string;
  href?: string;
  hrefLabel?: string;
}

export interface SyncWhatsNew {
  hasNew: boolean;
  notifications: SyncNotification[];
}

export interface SyncProviderWhatsNewInput {
  provider: string;
  importedItems: ImportedSourceItem[];
  knowledgeExtracted: SyncKnowledgeItem[];
}

export interface BuildSyncWhatsNewInput {
  providerResults: SyncProviderWhatsNewInput[];
  jiraDone: JiraDoneNotification[];
  myName: string | null;
  myEmail?: string | null;
}

const KNOWLEDGE_TYPE_LABEL: Record<string, string> = {
  requirement: "Requirement",
  decision: "Decision",
  open_question: "Open question",
  risk: "Risk",
  deadline: "Deadline",
  stakeholder_preference: "Preference",
  acceptance_criteria: "Done criteria",
};

const KNOWLEDGE_PRIORITY: Record<string, number> = {
  risk: 6,
  deadline: 5,
  decision: 4,
  requirement: 3,
  acceptance_criteria: 3,
  open_question: 2,
  stakeholder_preference: 1,
};

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function buildGeminiKnowledgeNotifications(
  input: BuildSyncWhatsNewInput
): SyncNotification[] {
  const gmailEntry = input.providerResults.find((entry) => entry.provider === "gmail");
  if (!gmailEntry || gmailEntry.importedItems.length === 0) return [];

  const newSourceIds = new Set(
    gmailEntry.importedItems.map((item) => item.sourceItemId)
  );

  const relevantKnowledge = gmailEntry.knowledgeExtracted
    .filter((item) => newSourceIds.has(item.sourceItemId) && !item.isUnclear)
    .filter((item) =>
      knowledgeItemMatchesMe(
        {
          id: item.id,
          projectId: item.projectId,
          type: item.type as KnowledgeItemView["type"],
          title: item.title,
          content: item.content,
          sourceItemId: item.sourceItemId,
          confidence: item.confidence,
          reviewStatus: "approved",
          evidenceQuotes: item.evidenceQuotes,
          createdAt: new Date().toISOString(),
          sourceTitle: null,
          sourceType: "gmail",
          sourceUrl: null,
          sourceDate: null,
          sourceAuthor: null,
          projectName: item.projectName,
        },
        input.myName,
        input.myEmail ?? null
      )
    )
    .sort(
      (a, b) =>
        (KNOWLEDGE_PRIORITY[b.type] ?? 0) - (KNOWLEDGE_PRIORITY[a.type] ?? 0)
    );

  if (relevantKnowledge.length === 0) return [];

  const top = relevantKnowledge[0];
  const typeLabel = KNOWLEDGE_TYPE_LABEL[top.type] ?? "Learning";
  const extraCount = relevantKnowledge.length - 1;

  return [
    {
      kind: "gemini_knowledge",
      title:
        extraCount > 0
          ? `New Gemini notes — ${relevantKnowledge.length} learnings for you`
          : "New Gemini notes",
      detail: `${typeLabel}: ${top.title} — ${truncate(top.content, 120)}`,
      href: `/knowledge#knowledge-${top.id}`,
      hrefLabel: "Review knowledge",
    },
  ];
}

function buildJiraDoneNotifications(jiraDone: JiraDoneNotification[]): SyncNotification[] {
  return jiraDone.map((issue) => ({
    kind: "jira_done" as const,
    title: `${issue.key} moved to ${issue.status}`,
    detail: issue.projectName
      ? `${issue.title} · ${issue.projectName}`
      : issue.title,
    href: issue.url ?? undefined,
    hrefLabel: issue.url ? "Open in Jira" : undefined,
  }));
}

export function buildSyncWhatsNew(input: BuildSyncWhatsNewInput): SyncWhatsNew {
  const notifications = [
    ...buildJiraDoneNotifications(input.jiraDone),
    ...buildGeminiKnowledgeNotifications(input),
  ];

  return {
    hasNew: notifications.length > 0,
    notifications,
  };
}

export function formatSyncNotificationToast(
  notification: SyncNotification
): { title: string; description: string; href?: string; hrefLabel?: string } {
  return {
    title: notification.title,
    description: notification.detail,
    href: notification.href,
    hrefLabel: notification.hrefLabel,
  };
}
