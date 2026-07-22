"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";

interface OwnershipDecisionButtonsProps {
  taskId: number;
  compact?: boolean;
}

export function OwnershipDecisionButtons({ taskId, compact = false }: OwnershipDecisionButtonsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function runAction(action: "confirm_mine" | "not_mine") {
    setPendingAction(action);
    try {
      const res = await fetch(`/api/work-tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Ownership action failed.");
      // task-detail-ux-audit F14: this write has no confirmation step (by
      // design — it's a local-only decision), but it does make the task
      // disappear from Today, so give the user a short recovery window
      // instead of a silent, irreversible removal.
      Toast.toast.success(action === "confirm_mine" ? "Marked as yours." : "Removed from Today.", {
        timeout: 8000,
        actionProps: {
          children: "Undo",
          onClick: () => void runUndo(),
        },
      });
      router.refresh();
    } catch {
      Toast.toast.danger("Could not update ownership. Try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function runUndo() {
    setPendingAction("undo");
    try {
      const res = await fetch(`/api/work-tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo_ownership" }),
      });
      if (!res.ok) throw new Error("Undo failed.");
      Toast.toast.success("Restored to Unclear.");
      router.refresh();
    } catch {
      Toast.toast.danger("Could not undo. Try again.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className={compact ? "flex flex-wrap gap-2" : "grid gap-2 sm:grid-cols-2"}>
      <Button
        type="button"
        size={compact ? "sm" : "md"}
        className={compact ? undefined : "h-11 w-full"}
        onClick={() => runAction("confirm_mine")}
        isDisabled={pendingAction !== null}
      >
        {pendingAction === "confirm_mine" ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
        ) : null}
        Confirm this is yours
      </Button>
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "md"}
        className={compact ? undefined : "h-11 w-full"}
        onClick={() => runAction("not_mine")}
        isDisabled={pendingAction !== null}
      >
        {pendingAction === "not_mine" ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
        ) : null}
        Mark as not mine
      </Button>
    </div>
  );
}
