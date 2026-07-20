"use client";

import { useCallback, useMemo, useState } from "react";
import type { TaskProgressState } from "@/domain/taskProgress";
import {
  hashTaskPlanVersion,
  stablePlanItemId,
} from "@/lib/tasks/taskPlanVersion";

export type PlanItemType = "step" | "done_criterion";

function buildProgressMap(initialProgress: TaskProgressState[], planVersion: string) {
  const map = new Map<string, boolean>();
  for (const entry of initialProgress) {
    if (entry.planVersion !== planVersion) continue;
    map.set(`${entry.itemType}:${entry.itemId}`, entry.completed);
  }
  return map;
}

/**
 * Shared persisted plan-progress state for one focus task. Both the hero
 * "current action" block and the work-order checklist read and write the
 * same map, so completing a step in either place stays in sync.
 */
export function useTaskPlanProgress({
  taskId,
  steps,
  doneCriteria,
  initialProgress,
}: {
  taskId: number | null;
  steps: string[];
  doneCriteria: string[];
  initialProgress: TaskProgressState[];
}) {
  const planVersion = useMemo(
    () => hashTaskPlanVersion(steps, doneCriteria),
    [steps, doneCriteria]
  );
  const stepIds = useMemo(
    () => steps.map((step, index) => stablePlanItemId("step", index, step)),
    [steps]
  );
  const criterionIds = useMemo(
    () =>
      doneCriteria.map((criterion, index) =>
        stablePlanItemId("done_criterion", index, criterion)
      ),
    [doneCriteria]
  );

  const [progressMap, setProgressMap] = useState(() =>
    buildProgressMap(initialProgress, planVersion)
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState({ initialProgress, planVersion });
  if (snapshot.initialProgress !== initialProgress || snapshot.planVersion !== planVersion) {
    setSnapshot({ initialProgress, planVersion });
    setProgressMap(buildProgressMap(initialProgress, planVersion));
  }

  const stepCompleted = useMemo(
    () => stepIds.map((id) => progressMap.get(`step:${id}`) === true),
    [progressMap, stepIds]
  );
  const criterionCompleted = useMemo(
    () => criterionIds.map((id) => progressMap.get(`done_criterion:${id}`) === true),
    [criterionIds, progressMap]
  );

  const toggleItem = useCallback(
    async (itemType: PlanItemType, itemId: string, completed: boolean) => {
      const key = `${itemType}:${itemId}`;
      setProgressMap((current) => new Map(current).set(key, completed));
      if (taskId == null) return;

      setPendingKey(key);
      try {
        const response = await fetch(`/api/work-tasks/${taskId}/progress`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planVersion, itemId, itemType, completed }),
        });
        if (!response.ok) throw new Error("Could not save progress.");
      } catch {
        setProgressMap((current) => {
          const next = new Map(current);
          next.delete(key);
          return next;
        });
      } finally {
        setPendingKey(null);
      }
    },
    [planVersion, taskId]
  );

  const firstOpenStep = stepCompleted.findIndex((value) => !value);
  const completedStepCount = stepCompleted.filter(Boolean).length;

  return {
    planVersion,
    stepIds,
    criterionIds,
    stepCompleted,
    criterionCompleted,
    completedStepCount,
    firstOpenStep,
    pendingKey,
    toggleItem,
  };
}

export type TaskPlanProgress = ReturnType<typeof useTaskPlanProgress>;
