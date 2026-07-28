/**
 * Pure helpers for shaping Figma REST comment payloads into connector
 * source candidates. Kept separate from the authenticated fetch so the
 * reply→parent inheritance rules can be unit-tested without a token.
 */

import { figmaDesignUrl } from "@/lib/connectors/figmaUrl";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";

export interface FigmaCommentInput {
  id: string;
  parent_id?: string | null;
  message: string;
  user: { handle?: string | null; email?: string | null };
  created_at: string;
  resolved_at?: string | null;
  order_id?: number | null;
  client_meta?: { node_id?: string | null } | null;
}

/** Normalize a comment node_id value to Figma's colon form (e.g. "1-2" → "1:2"). */
export function normalizeFigmaCommentNodeId(value: string): string {
  return value.trim().replace(/-/g, ":");
}

/**
 * Resolve the pinned node for a comment. Root comments carry `client_meta`;
 * replies usually do not — walk to the root parent so the reply inherits the
 * thread's pin. Returns null when the thread is unpinned or the parent is
 * missing from the batch.
 */
export function resolveFigmaCommentNodeId(
  comment: Pick<FigmaCommentInput, "id" | "parent_id" | "client_meta">,
  byId: Map<string, FigmaCommentInput>
): string | null {
  const own = comment.client_meta?.node_id
    ? normalizeFigmaCommentNodeId(comment.client_meta.node_id)
    : null;
  if (own) return own;

  let parentId = comment.parent_id ?? null;
  const seen = new Set<string>([comment.id]);
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    const parentNode = parent.client_meta?.node_id
      ? normalizeFigmaCommentNodeId(parent.client_meta.node_id)
      : null;
    if (parentNode) return parentNode;
    parentId = parent.parent_id ?? null;
  }
  return null;
}

function parentMessageForReply(
  comment: FigmaCommentInput,
  byId: Map<string, FigmaCommentInput>
): string | null {
  const parentId = comment.parent_id;
  if (!parentId) return null;
  const parent = byId.get(parentId);
  const message = parent?.message?.trim();
  return message ? message : null;
}

/**
 * Shape raw Figma comments into connector candidates. Replies inherit the
 * root pin's node id and include the parent message so merge/topic matching
 * can see the thread context (e.g. "banner" / "modules").
 */
export function shapeFigmaCommentCandidates(input: {
  fileKey: string;
  projectId?: number | null;
  comments: FigmaCommentInput[];
  /** ISO timestamp; comments older than this are skipped. */
  sinceIso?: string;
}): ConnectorSourceCandidate[] {
  const sinceMs = input.sinceIso ? Date.parse(input.sinceIso) : null;
  const byId = new Map(input.comments.map((comment) => [comment.id, comment]));
  const candidates: ConnectorSourceCandidate[] = [];

  for (const comment of input.comments) {
    if (comment.resolved_at) continue;

    if (sinceMs !== null) {
      const createdMs = Date.parse(comment.created_at);
      if (Number.isFinite(createdMs) && createdMs < sinceMs) continue;
    }

    const authorHandle = comment.user.handle ?? comment.user.email ?? null;
    const nodeId = resolveFigmaCommentNodeId(comment, byId);
    const url = nodeId
      ? figmaDesignUrl(input.fileKey, nodeId)
      : figmaDesignUrl(input.fileKey);

    const isReply = Boolean(comment.parent_id);
    const orderLabel =
      !isReply && comment.order_id != null ? `#${comment.order_id}` : null;
    const parentMessage = isReply ? parentMessageForReply(comment, byId) : null;

    const titleParts = [
      isReply ? "Reply on Figma comment" : "Figma comment",
      orderLabel,
      nodeId ? `(node ${nodeId})` : null,
    ].filter(Boolean);

    const body = [
      authorHandle ? `Author: ${authorHandle}` : null,
      !isReply && comment.order_id != null ? `Comment: ${orderLabel}` : null,
      isReply ? `Reply to: ${comment.parent_id}` : null,
      nodeId ? `Pinned to node: ${nodeId}` : null,
      parentMessage ? `Parent message: ${parentMessage}` : null,
      `Message: ${comment.message}`,
    ]
      .filter(Boolean)
      .join("\n");

    candidates.push({
      sourceType: "figma",
      sourceExternalId: `${input.fileKey}:comment:${comment.id}`,
      title: titleParts.join(" "),
      body,
      author: authorHandle,
      sourceDate: comment.created_at,
      url,
      projectId: input.projectId ?? null,
      metadata: {
        importedFrom: "figma_comment",
        fileKey: input.fileKey,
        commentId: comment.id,
        parentId: comment.parent_id ?? null,
        nodeId: nodeId ?? null,
        orderLabel: orderLabel ?? null,
        commentsImported: true,
        nodeIdInherited: Boolean(isReply && nodeId && !comment.client_meta?.node_id),
      },
    });
  }

  return candidates;
}
