import type { KnowledgeItemView } from "@/services/knowledgeItems";
import type { SourceType } from "@/domain/sourceItem";
import { parseJiraBodyFields } from "@/lib/connectors/jiraText";
import { myOwnerFilter, personMatchesFilter } from "@/lib/filters/ownerFilter";

export const KNOWLEDGE_MAX_AGE_DAYS = 10;

const PERSONAL_SOURCE_TYPES = new Set<SourceType>(["manual_transcript", "granola"]);

function normalizePerson(value: string): string {
  return value.trim().toLowerCase();
}

function itemSortDate(item: Pick<KnowledgeItemView, "sourceDate" | "createdAt">): string {
  return item.sourceDate ?? item.createdAt;
}

export function isKnowledgeFresh(
  item: Pick<KnowledgeItemView, "sourceDate" | "createdAt">,
  maxAgeDays = KNOWLEDGE_MAX_AGE_DAYS,
  now = Date.now()
): boolean {
  const time = new Date(itemSortDate(item)).getTime();
  if (Number.isNaN(time)) return false;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return now - time <= maxAgeMs;
}

function textMentionsPerson(text: string, myName: string): boolean {
  const me = normalizePerson(myName);
  if (!me) return false;

  const lowered = text.toLowerCase();
  if (lowered.includes(me)) return true;

  const firstName = me.split(/\s+/)[0];
  if (firstName && firstName.length >= 3 && lowered.includes(firstName)) return true;

  return false;
}

function itemTextMentionsMe(item: KnowledgeItemView, myName: string): boolean {
  if (textMentionsPerson(item.title, myName)) return true;
  if (textMentionsPerson(item.content, myName)) return true;
  return item.evidenceQuotes.some((quote) => textMentionsPerson(quote, myName));
}

function sourceAuthorMatchesMe(
  author: string | null,
  myName: string,
  myEmail: string | null
): boolean {
  const owners = myOwnerFilter(myName);
  if (!owners) return false;

  if (author?.trim()) {
    if (personMatchesFilter(author, owners, myName)) return true;
    if (myEmail && author.toLowerCase().includes(myEmail.toLowerCase())) return true;
  }

  return false;
}

function jiraSourceMatchesMe(sourceBody: string, myName: string): boolean {
  const owners = myOwnerFilter(myName);
  if (!owners) return false;

  const assignee = parseJiraBodyFields(sourceBody).assignee;
  if (assignee && personMatchesFilter(assignee, owners, myName)) return true;

  return textMentionsPerson(sourceBody, myName);
}

export function knowledgeItemMatchesMe(
  item: KnowledgeItemView,
  myName: string | null,
  myEmail: string | null = null
): boolean {
  if (!myName?.trim()) return false;

  if (item.sourceType && PERSONAL_SOURCE_TYPES.has(item.sourceType)) return true;

  if (sourceAuthorMatchesMe(item.sourceAuthor, myName, myEmail)) return true;

  if (itemTextMentionsMe(item, myName)) return true;

  return false;
}

/** Full Jira body check — call when source body is available on the server. */
export function knowledgeItemMatchesMeWithSource(
  item: KnowledgeItemView,
  sourceBody: string | null,
  myName: string | null,
  myEmail: string | null = null
): boolean {
  if (!myName?.trim()) return false;
  if (knowledgeItemMatchesMe(item, myName, myEmail)) return true;

  if (item.sourceType === "jira" && sourceBody && jiraSourceMatchesMe(sourceBody, myName)) {
    return true;
  }

  if (sourceBody && textMentionsPerson(sourceBody, myName)) return true;

  return false;
}

export function filterKnowledgeForMe(
  items: KnowledgeItemView[],
  options: {
    myName: string | null;
    myEmail?: string | null;
    sourceBodyByItemId?: Map<number, string>;
    maxAgeDays?: number;
  }
): KnowledgeItemView[] {
  const { myName, myEmail = null, sourceBodyByItemId, maxAgeDays = KNOWLEDGE_MAX_AGE_DAYS } =
    options;

  return items.filter((item) => {
    if (!isKnowledgeFresh(item, maxAgeDays)) return false;

    const sourceBody =
      item.sourceItemId != null ? sourceBodyByItemId?.get(item.sourceItemId) ?? null : null;

    return knowledgeItemMatchesMeWithSource(item, sourceBody, myName, myEmail);
  });
}

export function knowledgeSearchHaystack(
  item: Pick<
    KnowledgeItemView,
    "title" | "content" | "projectName" | "sourceTitle" | "evidenceQuotes"
  >
): string {
  return [
    item.title,
    item.content,
    item.projectName ?? "",
    item.sourceTitle ?? "",
    ...item.evidenceQuotes,
  ]
    .join("\n")
    .toLowerCase();
}

export function filterKnowledgeByQuery<T extends Pick<KnowledgeItemView, "title" | "content" | "projectName" | "sourceTitle" | "evidenceQuotes">>(
  items: T[],
  query: string
): T[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;

  const terms = Array.from(
    new Set(
      trimmed
        .split(/[^a-z0-9]+/i)
        .filter((term) => term.length >= 2)
    )
  );

  if (terms.length === 0) {
    return items.filter((item) => knowledgeSearchHaystack(item).includes(trimmed));
  }

  return items.filter((item) => {
    const haystack = knowledgeSearchHaystack(item);
    return terms.every((term) => haystack.includes(term));
  });
}
