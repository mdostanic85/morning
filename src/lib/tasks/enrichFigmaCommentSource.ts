/**
 * Enrich already-imported Figma comment replies with parent-thread context.
 *
 * Fresh syncs inherit node id + parent message in `shapeFigmaCommentCandidates`.
 * Older rows (and any reply whose parent landed in a later sync batch) still
 * need this pass before merge, otherwise replies with `nodeId: null` spawn
 * orphan tasks instead of updating the design work under discussion.
 */

import "server-only";
import { figmaDesignUrl } from "@/lib/connectors/figmaUrl";
import type { SourceItem } from "@/domain/sourceItem";
import { getSourceItemByExternalId } from "@/services/sourceItems";
import { getTaskIdForSourceItem } from "@/services/evidence";

function extractMessageFromCommentBody(body: string): string | null {
  // Only the Message line — do not swallow trailing @mentions / blank lines.
  const match = body.match(/^Message:\s*(.+)$/m);
  const value = match?.[1]?.trim();
  return value || null;
}

export async function enrichFigmaCommentSourceForMerge(
  sourceItem: SourceItem
): Promise<SourceItem> {
  if (
    sourceItem.sourceType !== "figma" ||
    sourceItem.metadata?.importedFrom !== "figma_comment"
  ) {
    return sourceItem;
  }

  const parentId =
    typeof sourceItem.metadata?.parentId === "string" && sourceItem.metadata.parentId
      ? sourceItem.metadata.parentId
      : null;
  const fileKey =
    typeof sourceItem.metadata?.fileKey === "string" ? sourceItem.metadata.fileKey : null;
  if (!parentId || !fileKey) return sourceItem;

  const parent = await getSourceItemByExternalId({
    sourceType: "figma",
    sourceExternalId: `${fileKey}:comment:${parentId}`,
  });
  if (!parent) return sourceItem;

  const ownNodeId =
    typeof sourceItem.metadata?.nodeId === "string" && sourceItem.metadata.nodeId
      ? sourceItem.metadata.nodeId
      : null;
  const parentNodeId =
    typeof parent.metadata?.nodeId === "string" && parent.metadata.nodeId
      ? parent.metadata.nodeId
      : null;
  const nodeId = ownNodeId ?? parentNodeId;

  const parentMessage = extractMessageFromCommentBody(parent.body);
  let body = sourceItem.body;
  if (nodeId && !/^Pinned to node:/m.test(body)) {
    body = body.replace(/^(Reply to:.*)$/m, `$1\nPinned to node: ${nodeId}`);
    if (!/^Pinned to node:/m.test(body)) {
      body = `Pinned to node: ${nodeId}\n${body}`;
    }
  }
  if (parentMessage && !/^Parent message:/m.test(body)) {
    body = body.replace(/^(Message:)/m, `Parent message: ${parentMessage}\n$1`);
    if (!/^Parent message:/m.test(body)) {
      body = `${body}\nParent message: ${parentMessage}`;
    }
  }

  const parentLinkedTaskId = await getTaskIdForSourceItem(parent.id);

  return {
    ...sourceItem,
    body,
    url: nodeId ? figmaDesignUrl(fileKey, nodeId) : sourceItem.url,
    metadata: {
      ...sourceItem.metadata,
      nodeId: nodeId ?? sourceItem.metadata?.nodeId ?? null,
      nodeIdInherited: Boolean(!ownNodeId && nodeId),
      parentLinkedTaskId: parentLinkedTaskId ?? null,
    },
  };
}
