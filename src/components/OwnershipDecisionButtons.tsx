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
      Toast.toast.success(action === "confirm_mine" ? "Marked as yours." : "Removed from Today.");
      router.refresh();
    } catch {
      Toast.toast.danger("Could not update ownership. Try again.");
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
