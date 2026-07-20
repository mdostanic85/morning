import type { KnowledgeItemView } from "@/services/knowledgeItems";
import type { SourceType } from "@/domain/sourceItem";
import { parseJiraBodyFields } from "@/lib/connectors/jiraText";
import { myOwnerFilter, personMatchesFilter } from "@/lib/filters/ownerFilter";
import {
  granolaTextsMatchMe,
  textMentionsPerson,
  type GranolaWorkContext,
} from "@/lib/granola/personalKnowledge";

export const KNOWLEDGE_MAX_AGE_DAYS = 10;

// These connectors represent the user's own inbox/calendar or explicitly
// supplied material, so their fresh knowledge can be relevant without a
// project link or a literal mention of the user's name.
const PERSONAL_SOURCE_TYPES = new Set<SourceType>([
  "manual_transcript",
  "gmail",
  "calendar",
]);

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

function textMentionsPersonInItem(item: KnowledgeItemView, myName: string): boolean {
  if (textMentionsPerson(item.title, myName)) return true;
  if (textMentionsPerson(item.content, myName)) return true;
  return item.evidenceQuotes.some((quote) => textMentionsPerson(quote, myName));
}

function itemTextMentionsMe(item: KnowledgeItemView, myName: string): boolean {
  return textMentionsPersonInItem(item, myName);
}

function granolaKnowledgeItemMatchesMe(
  item: KnowledgeItemView,
  sourceBody: string | null,
  context: GranolaWorkContext
): boolean {
  const texts = [
    item.title,
    item.content,
    ...item.evidenceQuotes,
    sourceBody ?? "",
  ];
  return granolaTextsMatchMe(texts, context);
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
  myEmail: string | null = null,
  granolaWorkContext: GranolaWorkContext | null = null
): boolean {
  if (!myName?.trim()) return false;

  if (item.sourceType === "granola") {
    if (!granolaWorkContext) return false;
    return granolaKnowledgeItemMatchesMe(item, null, granolaWorkContext);
  }

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
  myEmail: string | null = null,
  granolaWorkContext: GranolaWorkContext | null = null
): boolean {
  if (!myName?.trim()) return false;

  if (item.sourceType === "granola") {
    if (!granolaWorkContext) return false;
    return granolaKnowledgeItemMatchesMe(item, sourceBody, granolaWorkContext);
  }

  if (knowledgeItemMatchesMe(item, myName, myEmail, granolaWorkContext)) return true;

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
    granolaWorkContext?: GranolaWorkContext | null;
  }
): KnowledgeItemView[] {
  const {
    myName,
    myEmail = null,
    sourceBodyByItemId,
    maxAgeDays = KNOWLEDGE_MAX_AGE_DAYS,
    granolaWorkContext = null,
  } = options;

  return items.filter((item) => {
    if (!isKnowledgeFresh(item, maxAgeDays)) return false;

    const sourceBody =
      item.sourceItemId != null ? sourceBodyByItemId?.get(item.sourceItemId) ?? null : null;

    return knowledgeItemMatchesMeWithSource(
      item,
      sourceBody,
      myName,
      myEmail,
      granolaWorkContext
    );
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
