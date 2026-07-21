"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { DailyBriefV2 } from "@/domain/dailyBrief";
import { AppBadge } from "@/components/AppBadge";
import { Button } from "@heroui/react/button";
import { Loader2Icon } from "lucide-react";
import { Toast } from "@heroui/react/toast";

export function SourceConflictCard({
  conflict,
  sourceLabels,
}: {
  conflict: DailyBriefV2["sourceConflicts"][number];
  sourceLabels: string[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function decide(decision: "keep_open" | "mark_done_locally" | "decide_later") {
    if (conflict.taskId == null) return;
    setPending(decision);
    try {
      const res = await fetch(`/api/work-tasks/${conflict.taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve_conflict",
          decision,
          summary: conflict.summary,
          evidenceSourceItemIds: conflict.evidenceIds,
        }),
      });
      if (!res.ok) throw new Error("Conflict decision failed.");
      Toast.toast.success("Conflict decision saved locally.");
      router.refresh();
    } catch {
      Toast.toast.danger("Could not save conflict decision.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="brief-secondary-card">
      <div className="brief-secondary-badges">
        <AppBadge tone="danger" icon={<AlertTriangle className="size-3.5" aria-hidden />}>
          Conflict
        </AppBadge>
      </div>
      <p className="brief-secondary-reason">{conflict.summary}</p>
      {sourceLabels.length > 0 ? (
        <p className="brief-secondary-next">
          <span className="brief-secondary-next-label">Sources: </span>
          {sourceLabels.join(" · ")}
        </p>
      ) : null}
      {conflict.taskId != null ? (
        <div className="mt-3 grid gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="justify-start"
            onClick={() => decide("keep_open")}
            isDisabled={pending !== null}
          >
            {pending === "keep_open" ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Keep task open
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="justify-start"
            onClick={() => decide("mark_done_locally")}
            isDisabled={pending !== null}
          >
            {pending === "mark_done_locally" ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Mark task done locally
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="justify-start"
            onClick={() => decide("decide_later")}
            isDisabled={pending !== null}
          >
            {pending === "decide_later" ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Decide later
          </Button>
        </div>
      ) : null}
    </div>
  );
}
