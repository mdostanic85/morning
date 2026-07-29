/**
 * Database-backed reads for a Figma comment thread. The thread rules live in
 * `./commentThread.ts`; this module only loads the rows they operate on.
 */

import "server-only";
import {
  figmaCommentThreadKey,
  resolveFigmaCommentThreadProjectId,
  selectFigmaCommentThread,
} from "./commentThread";
import { getFigmaCommentSourceItems, updateSourceItem } from "@/services/sourceItems";
import { getTaskIdForSourceItem } from "@/services/evidence";
import type { SourceItem } from "@/domain/sourceItem";

/** Thread members other than `sourceItem`, oldest first. */
export async function loadFigmaCommentThreadSiblings(
  sourceItem: SourceItem
): Promise<SourceItem[]> {
  const key = figmaCommentThreadKey(sourceItem);
  if (!key) return [];
  const fileComments = await getFigmaCommentSourceItems(key.fileKey);
  return selectFigmaCommentThread(fileComments, key, {
    excludeSourceItemId: sourceItem.id,
  });
}

/**
 * Assign an unclassified Figma comment to the project its thread already
 * belongs to. Without this the LLM project matcher classifies every reply on
 * its own and a single thread drifts across projects, which silently removes
 * the thread's task from the merge candidate set (the extractor only considers
 * tasks in the source's project).
 *
 * Returns the source item unchanged when it already has a project, is not a
 * Figma comment, or the thread has no classified member yet.
 */
export async function inheritFigmaCommentThreadProject(
  sourceItem: SourceItem
): Promise<SourceItem> {
  if (sourceItem.projectId != null) return sourceItem;
  const siblings = await loadFigmaCommentThreadSiblings(sourceItem);
  if (siblings.length === 0) return sourceItem;

  const inherited = resolveFigmaCommentThreadProjectId(siblings);
  if (!inherited) return sourceItem;

  const updated = await updateSourceItem(sourceItem.id, {
    projectId: inherited.projectId,
    metadata: {
      ...(sourceItem.metadata ?? {}),
      projectFromThread: {
        projectId: inherited.projectId,
        fromSourceItemId: inherited.fromSourceItemId,
        resolvedAt: new Date().toISOString(),
      },
    },
  });
  return updated ?? sourceItem;
}

/**
 * Task the thread is already attached to, if any. Checks every other comment
 * in the thread — newest first — not just the direct parent: a thread's task
 * is often created from a mid-thread reply, so the root itself carries no
 * evidence link.
 */
export async function resolveFigmaCommentThreadTaskId(
  siblings: SourceItem[]
): Promise<number | null> {
  for (const item of [...siblings].reverse()) {
    const taskId = await getTaskIdForSourceItem(item.id);
    if (taskId != null) return taskId;
  }
  return null;
}
