import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { postgresClient } from "@/db/connection";
import {
  evidence as evidenceTable,
  sourceItems,
  taskCriterionEvidence,
  workTasks,
} from "@/db/tables";
import { execute, fetchAll, fetchReturning } from "@/db/query";
import { deleteEvidenceByIds, replaceEvidenceForTaskSource } from "./evidence";
import { deleteWorkTask } from "./workTasks";

/**
 * `task_criterion_evidence.evidence_id` references `evidence.id` without
 * ON DELETE CASCADE. Deleting evidence while a criterion link still points at
 * it raised 23503 and failed the whole rebuild-queue sync phase, surfacing to
 * the user as "Sync couldn't finish while rebuilding today's plan."
 */

const createdTaskIds: number[] = [];
const createdSourceIds: number[] = [];

async function createTaskWithLinkedEvidence() {
  const [source] = await fetchReturning(
    db
      .insert(sourceItems)
      .values({
        sourceType: "granola",
        title: "Criterion FK regression source",
        body: "We agreed you will ship the export flow this week.",
        sourceDate: "2026-08-05",
      })
      .returning()
  );
  createdSourceIds.push(source.id);

  const [task] = await fetchReturning(
    db
      .insert(workTasks)
      .values({
        title: "Criterion FK regression task",
        status: "next",
        reason: "Guards the evidence delete path used by the queue rebuild.",
        nextAction: "Delete the cited evidence row.",
        doneCriteria: ["Export flow is live"],
      })
      .returning()
  );
  createdTaskIds.push(task.id);

  const [cited] = await fetchReturning(
    db
      .insert(evidenceTable)
      .values({
        taskId: task.id,
        sourceItemId: source.id,
        quote: "you will ship the export flow this week",
        summary: "Commitment captured in the sync",
        sourceDate: "2026-08-05",
      })
      .returning()
  );

  await execute(
    db.insert(taskCriterionEvidence).values({
      taskId: task.id,
      criterionItemId: "done_criterion-0-regression",
      evidenceId: cited.id,
      createdAt: new Date().toISOString(),
    })
  );

  return { task, source, cited };
}

after(async () => {
  try {
    if (createdTaskIds.length > 0) {
      await execute(
        db.delete(taskCriterionEvidence).where(inArray(taskCriterionEvidence.taskId, createdTaskIds))
      );
      await execute(db.delete(evidenceTable).where(inArray(evidenceTable.taskId, createdTaskIds)));
      await execute(db.delete(workTasks).where(inArray(workTasks.id, createdTaskIds)));
    }
    if (createdSourceIds.length > 0) {
      await execute(db.delete(sourceItems).where(inArray(sourceItems.id, createdSourceIds)));
    }
  } finally {
    await postgresClient.end();
  }
});

describe("evidence deletes clear their criterion links", () => {
  it("deleteEvidenceByIds removes evidence a done-criterion still cites", async () => {
    const { task, cited } = await createTaskWithLinkedEvidence();

    const removed = await deleteEvidenceByIds([cited.id]);

    const [remainingEvidence, remainingLinks] = await Promise.all([
      fetchAll(db.select({ id: evidenceTable.id }).from(evidenceTable).where(eq(evidenceTable.id, cited.id))),
      fetchAll(
        db
          .select({ id: taskCriterionEvidence.id })
          .from(taskCriterionEvidence)
          .where(eq(taskCriterionEvidence.taskId, task.id))
      ),
    ]);

    assert.equal(removed, 1);
    assert.equal(remainingEvidence.length, 0);
    assert.equal(remainingLinks.length, 0, "the dangling criterion link must go with the evidence");
  });

  it("replaceEvidenceForTaskSource swaps evidence a done-criterion still cites", async () => {
    const { task, source, cited } = await createTaskWithLinkedEvidence();

    const replaced = await replaceEvidenceForTaskSource(task.id, source.id, [
      {
        quote: "ship the export flow this week",
        summary: "Re-extracted on the next sync",
        sourceDate: "2026-08-05",
        url: null,
      },
    ]);

    const [oldRow, links] = await Promise.all([
      fetchAll(db.select({ id: evidenceTable.id }).from(evidenceTable).where(eq(evidenceTable.id, cited.id))),
      fetchAll(
        db
          .select({ id: taskCriterionEvidence.id })
          .from(taskCriterionEvidence)
          .where(eq(taskCriterionEvidence.taskId, task.id))
      ),
    ]);

    assert.equal(replaced.length, 1);
    assert.equal(replaced[0].quote, "ship the export flow this week");
    assert.equal(oldRow.length, 0);
    assert.equal(links.length, 0);
  });

  it("deleteWorkTask removes a task that still has criterion-linked evidence", async () => {
    const { task, cited } = await createTaskWithLinkedEvidence();

    await deleteWorkTask(task.id);

    const [remainingTask, remainingEvidence, remainingLinks] = await Promise.all([
      fetchAll(db.select({ id: workTasks.id }).from(workTasks).where(eq(workTasks.id, task.id))),
      fetchAll(db.select({ id: evidenceTable.id }).from(evidenceTable).where(eq(evidenceTable.id, cited.id))),
      fetchAll(
        db
          .select({ id: taskCriterionEvidence.id })
          .from(taskCriterionEvidence)
          .where(eq(taskCriterionEvidence.taskId, task.id))
      ),
    ]);

    assert.equal(remainingTask.length, 0);
    assert.equal(remainingEvidence.length, 0);
    assert.equal(remainingLinks.length, 0, "criterion links must not outlive the deleted task");
  });
});
