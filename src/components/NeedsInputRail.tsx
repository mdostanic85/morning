"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import type { DailyBriefV2 } from "@/domain/dailyBrief";
import { AppBadge } from "@/components/AppBadge";
import styles from "./NeedsInputRail.module.css";

function css(value: string): string {
  return value
    .split(/\s+/)
    .map((name) => styles[name] ?? name)
    .join(" ");
}

type BlockedItem = DailyBriefV2["blockedWaiting"][number];
type ConflictItem = DailyBriefV2["sourceConflicts"][number];
type TriageAction = "mine" | "not_mine";

function OwnershipRow({
  item,
  onResolved,
}: {
  item: BlockedItem;
  onResolved: (id: number) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<TriageAction | null>(null);
  const isWaiting = /^waiting on/i.test(item.reason);

  async function triage(action: TriageAction) {
    if (item.taskId == null || pending != null) return;
    setPending(action);
    try {
      const res = await fetch(`/api/work-tasks/${item.taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Task update failed.");
      Toast.toast.success(
        action === "mine" ? "Added to your queue." : "Removed and marked not yours.",
      );
      if (item.taskId != null) onResolved(item.taskId);
      router.refresh();
    } catch {
      Toast.toast.danger("Could not update the task. Try again.");
      setPending(null);
    }
  }

  return (
    <div className={css("ni-row")}>
      <div className={css("ni-row-head")}>
        <AppBadge tone="warning">{isWaiting ? "Waiting" : "Clarify ownership"}</AppBadge>
        {item.jiraKey ? <AppBadge tone="neutral">{item.jiraKey}</AppBadge> : null}
      </div>
      {item.taskId != null ? (
        <Link href={`/tasks/${item.taskId}`} className={css("ni-row-title")}>
          {item.title}
        </Link>
      ) : (
        <p className={css("ni-row-title")}>{item.title}</p>
      )}
      <p className={css("ni-row-reason")}>{item.description?.trim() || item.reason}</p>
      {item.taskId != null ? (
        <div className={css("ni-row-actions")}>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={() => void triage("mine")}
            isDisabled={pending != null}
          >
            {pending === "mine" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            This is mine
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void triage("not_mine")}
            isDisabled={pending != null}
          >
            {pending === "not_mine" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            Not mine
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ConflictRow({ conflict }: { conflict: ConflictItem }) {
  return (
    <div className={css("ni-row ni-row--conflict")}>
      <div className={css("ni-row-head")}>
        <AppBadge tone="danger">Source conflict</AppBadge>
      </div>
      <p className={css("ni-row-reason")}>{conflict.summary}</p>
    </div>
  );
}

export function NeedsInputRail({
  blockedWaiting,
  conflicts,
}: {
  blockedWaiting: BlockedItem[];
  conflicts: ConflictItem[];
}) {
  const [open, setOpen] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<Set<number>>(new Set());

  const visibleBlocked = blockedWaiting.filter(
    (item) => item.taskId == null || !resolvedIds.has(item.taskId),
  );
  const total = visibleBlocked.length + conflicts.length;

  if (total === 0) return null;

  function markResolved(id: number) {
    setResolvedIds((prev) => new Set([...prev, id]));
  }

  const firstTitle = visibleBlocked[0]?.title ?? "source conflict";
  const countCopy =
    total === 1
      ? `"${firstTitle}" needs your input`
      : `${total} items need your input`;
  const ctaCopy = total === 1 ? "Review" : `Review ${total} items`;

  return (
    <div className={css("ni-rail")} aria-live="polite">
      <button
        type="button"
        className={css("ni-trigger")}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <AlertTriangle className={css("ni-trigger-icon")} aria-hidden />
        <span className={css("ni-trigger-copy")}>{countCopy}</span>
        <span className={css("ni-trigger-cta")}>{ctaCopy}</span>
        <ChevronDown
          className={css(
            `ni-trigger-chevron${open ? " ni-trigger-chevron--open" : ""}`
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className={css("ni-tray")}>
          {visibleBlocked.map((item) => (
            <OwnershipRow
              key={item.jiraKey ?? item.title}
              item={item}
              onResolved={markResolved}
            />
          ))}
          {conflicts.map((conflict) => (
            <ConflictRow key={conflict.summary} conflict={conflict} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
