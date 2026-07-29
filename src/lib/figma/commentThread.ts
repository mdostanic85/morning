/**
 * Pure helpers for reading an already-imported Figma comment thread out of a
 * set of source items.
 *
 * A Figma thread is one root comment plus its replies, all pinned to the same
 * node. Each comment lands as its own source item, so anything that needs the
 * conversation (project inheritance, merge anchoring, delivery sync review)
 * has to reassemble the thread from `metadata.fileKey` / `commentId` /
 * `parentId`. Keeping that reassembly here — with no DB or network access —
 * makes the ordering and inheritance rules unit-testable.
 */

export interface FigmaCommentSourceLike {
  id: number;
  projectId: number | null;
  sourceType: string;
  author: string | null;
  sourceDate: string;
  body: string;
  metadata: Record<string, unknown> | null;
}

export interface FigmaCommentThreadKey {
  fileKey: string;
  /** Comment id of the thread root — replies carry it as `parentId`. */
  rootCommentId: string;
}

function metadataString(
  metadata: Record<string, unknown> | null,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function isFigmaCommentSource(item: FigmaCommentSourceLike): boolean {
  return (
    item.sourceType === "figma" && item.metadata?.importedFrom === "figma_comment"
  );
}

/**
 * Thread identity for one comment source item. Root comments anchor on their
 * own `commentId`; replies anchor on `parentId`. Figma sends `parent_id: ""`
 * for roots, so empty strings must not be read as a parent.
 */
export function figmaCommentThreadKey(
  item: FigmaCommentSourceLike
): FigmaCommentThreadKey | null {
  if (!isFigmaCommentSource(item)) return null;
  const fileKey = metadataString(item.metadata, "fileKey");
  if (!fileKey) return null;
  const rootCommentId =
    metadataString(item.metadata, "parentId") ??
    metadataString(item.metadata, "commentId");
  if (!rootCommentId) return null;
  return { fileKey, rootCommentId };
}

/** Oldest first, so "the newest statement in the thread" is always the last entry. */
function byOldestFirst(
  a: FigmaCommentSourceLike,
  b: FigmaCommentSourceLike
): number {
  const aTime = Date.parse(a.sourceDate);
  const bTime = Date.parse(b.sourceDate);
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return aTime - bTime;
  }
  return a.id - b.id;
}

/**
 * Every imported comment belonging to one thread (root + replies), oldest
 * first. `excludeSourceItemId` drops the item being processed so callers can
 * ask "what did the rest of the thread already establish?".
 */
export function selectFigmaCommentThread<T extends FigmaCommentSourceLike>(
  items: T[],
  key: FigmaCommentThreadKey,
  options: { excludeSourceItemId?: number } = {}
): T[] {
  return items
    .filter((item) => {
      if (item.id === options.excludeSourceItemId) return false;
      const itemKey = figmaCommentThreadKey(item);
      return (
        itemKey?.fileKey === key.fileKey &&
        itemKey?.rootCommentId === key.rootCommentId
      );
    })
    .sort(byOldestFirst);
}

/**
 * Comments pinned to one frame, oldest first. Falls back to every comment in
 * the file when the frame URL carries no node id, and keeps only the newest
 * `limit` entries so a busy file cannot flood a prompt.
 */
export function selectFigmaCommentsForFrame<T extends FigmaCommentSourceLike>(
  items: T[],
  frame: { fileKey: string; nodeId?: string | null },
  limit = 20
): T[] {
  const matching = items
    .filter((item) => {
      if (!isFigmaCommentSource(item)) return false;
      if (metadataString(item.metadata, "fileKey") !== frame.fileKey) return false;
      if (!frame.nodeId) return true;
      return metadataString(item.metadata, "nodeId") === frame.nodeId;
    })
    .sort(byOldestFirst);

  return matching.length > limit ? matching.slice(matching.length - limit) : matching;
}

/**
 * The comment text itself, without the `Author:` / `Pinned to node:` /
 * `Parent message:` preamble that `shapeFigmaCommentCandidates` writes above
 * it. `Message:` is always the last labelled field, so everything after it
 * belongs to the comment — including trailing @mentions and blank lines.
 */
export function figmaCommentMessage(body: string): string | null {
  const match = body.match(/^Message:[ \t]*([\s\S]*)$/m);
  const value = match?.[1]?.trim();
  return value || null;
}

/** First line of the comment only — for inlining as `Parent message:` context. */
export function figmaCommentMessageFirstLine(body: string): string | null {
  const match = body.match(/^Message:[ \t]*(.+)$/m);
  const value = match?.[1]?.trim();
  return value || null;
}

/**
 * Project a thread already belongs to. The oldest member with a project wins:
 * a thread is one conversation about one piece of design work, so later
 * replies must inherit rather than be re-classified independently.
 */
export function resolveFigmaCommentThreadProjectId(
  thread: FigmaCommentSourceLike[]
): { projectId: number; fromSourceItemId: number } | null {
  for (const item of [...thread].sort(byOldestFirst)) {
    if (item.projectId != null) {
      return { projectId: item.projectId, fromSourceItemId: item.id };
    }
  }
  return null;
}
