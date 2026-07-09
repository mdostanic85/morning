import "server-only";
import { indexKnowledgeItem } from "@/lib/knowledge/embeddings";
import {
  approveKnowledgeItem,
  getPendingKnowledgeItems,
} from "@/services/knowledgeItems";
import { getSourceItemById } from "@/services/sourceItems";
import { approveWorkTask, getPendingTasks } from "@/services/workTasks";

/** Flushes legacy pending extractions into the live queue and knowledge index. */
export async function approveAllPendingExtractions(): Promise<{
  tasks: number;
  knowledge: number;
}> {
  let tasks = 0;
  let knowledge = 0;

  for (const task of await getPendingTasks()) {
    if (await approveWorkTask(task.id)) tasks += 1;
  }

  for (const item of await getPendingKnowledgeItems()) {
    const approved = await approveKnowledgeItem(item.id);
    if (!approved) continue;
    knowledge += 1;
    try {
      const sourceItem = approved.sourceItemId
        ? await getSourceItemById(approved.sourceItemId)
        : null;
      await indexKnowledgeItem(approved, sourceItem);
    } catch {
      // Accepted even if indexing fails.
    }
  }

  return { tasks, knowledge };
}
