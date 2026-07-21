import "server-only";
import { getConnectionByProvider } from "@/services/connections";
import { isMcpTransport } from "@/lib/connectors/transport";
import { getSourceItems, getSourceItemByExternalId } from "@/services/sourceItems";
import { createSourceItem, updateSourceItem } from "@/services/sourceItems";
import { parseLinkedJiraRefs } from "@/lib/tasks/linkedJiraRetrieval";

const MAX_LINKED_FETCHES = 8;

/**
 * After Jira sources are synced, follow depth-1 browse/key links and import
 * missing issues as read-only evidence (or leave a not_loaded stub).
 */
export async function importLinkedJiraEvidence(): Promise<{
  fetched: number;
  missing: number;
}> {
  const connection = await getConnectionByProvider("jira");
  if (connection?.status !== "connected" || !isMcpTransport(connection)) {
    return { fetched: 0, missing: 0 };
  }

  const sources = await getSourceItems();
  const jiraSources = sources.filter((source) => source.sourceType === "jira");
  const parentKeys = new Set(
    jiraSources
      .map((source) => source.sourceExternalId?.toUpperCase())
      .filter((key): key is string => Boolean(key))
  );

  const refs = new Map<string, ReturnType<typeof parseLinkedJiraRefs>[number]>();
  for (const source of jiraSources) {
    for (const ref of parseLinkedJiraRefs({
      text: source.body,
      parentIssueKey: source.sourceExternalId,
    })) {
      if (parentKeys.has(ref.issueKey)) continue;
      if (!refs.has(ref.issueKey)) refs.set(ref.issueKey, ref);
      if (refs.size >= MAX_LINKED_FETCHES) break;
    }
    if (refs.size >= MAX_LINKED_FETCHES) break;
  }

  if (refs.size === 0) return { fetched: 0, missing: 0 };

  const { fetchJiraIssueByKeyViaMcp } = await import(
    "@/lib/connectors/mcp/adapters/atlassian"
  );

  let fetched = 0;
  let missing = 0;
  for (const ref of refs.values()) {
    const existing = await getSourceItemByExternalId({
      sourceType: "jira",
      sourceExternalId: ref.issueKey,
    });
    if (existing && existing.body.trim().length > 0) continue;

    try {
      const candidate = await fetchJiraIssueByKeyViaMcp(ref.issueKey);
      if (!candidate) {
        missing += 1;
        if (!existing) {
          await createSourceItem({
            sourceType: "jira",
            sourceExternalId: ref.issueKey,
            title: `${ref.issueKey} (linked, not loaded)`,
            body: "",
            sourceDate: new Date().toISOString(),
            url: null,
            metadata: {
              key: ref.issueKey,
              fetchStatus: "not_loaded",
              missingEvidence: `${ref.issueKey} comment`,
              linkedRelation: ref.relation,
            },
          });
        }
        continue;
      }

      if (existing) {
        await updateSourceItem(existing.id, {
          title: candidate.title,
          body: candidate.body,
          sourceDate: candidate.sourceDate,
          url: candidate.url ?? null,
          metadata: {
            ...(candidate.metadata ?? {}),
            linkedRelation: ref.relation,
          },
        });
      } else {
        await createSourceItem({
          sourceType: "jira",
          sourceExternalId: candidate.sourceExternalId,
          title: candidate.title,
          body: candidate.body,
          author: candidate.author ?? null,
          sourceDate: candidate.sourceDate,
          url: candidate.url ?? null,
          metadata: {
            ...(candidate.metadata ?? {}),
            linkedRelation: ref.relation,
          },
        });
      }
      fetched += 1;
    } catch {
      missing += 1;
    }
  }

  return { fetched, missing };
}
