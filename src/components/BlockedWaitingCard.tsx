"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock3, Loader2Icon } from "lucide-react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import type { DailyBriefV2 } from "@/domain/dailyBrief";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import { Heading } from "@/components/Heading";
import styles from "./HumanReadableTodayView.module.css";

function css(value: string): string {
  return value
    .split(/\s+/)
    .map((name) => styles[name] ?? name)
    .join(" ");
}

type TriageAction = "mine" | "not_mine";

function StatusBadge({
  label,
  tone,
  Icon,
}: {
  label: string;
  tone: AppBadgeTone;
  Icon: typeof Clock3;
}) {
  return (
    <AppBadge tone={tone} icon={<Icon className="size-3.5" aria-hidden />}>
      {label}
    </AppBadge>
  );
}

/**
 * A "Needs your input" item, kept deliberately simple: a status badge, the
 * title, one sentence of context, and a single ownership decision — confirm
 * it's yours (queues it) or mark it not yours (removes it). Both write only to
 * the local task via the status API — no external system is touched.
 */
export function BlockedWaitingCard({ item }: { item: DailyBriefV2["blockedWaiting"][number] }) {
  const router = useRouter();
  const [pending, setPending] = useState<TriageAction | null>(null);
  const isWaiting = /^waiting on/i.test(item.reason);
  const badge = isWaiting
    ? { label: "Waiting", tone: "warning" as AppBadgeTone, Icon: Clock3 }
    : { label: "Clarify ownership", tone: "warning" as AppBadgeTone, Icon: AlertTriangle };

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
        action === "mine" ? "Added to your queue." : "Removed and marked not yours."
      );
      router.refresh();
    } catch {
      Toast.toast.danger("Could not update the task. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={css("brief-secondary-card")}>
      <div className={css("brief-secondary-badges")}>
        <StatusBadge label={badge.label} tone={badge.tone} Icon={badge.Icon} />
        {item.jiraKey ? <AppBadge tone="neutral">{item.jiraKey}</AppBadge> : null}
      </div>

      {item.taskId != null ? (
        <Link href={`/tasks/${item.taskId}`} className={css("brief-secondary-title-link")}>
          <Heading level={3} visualLevel={5} className={css("brief-secondary-title")}>{item.title}</Heading>
        </Link>
      ) : (
        <Heading level={3} visualLevel={5} className={css("brief-secondary-title")}>{item.title}</Heading>
      )}

      <p className={css("brief-secondary-reason")}>{item.description?.trim() || item.reason}</p>

      {item.taskId != null ? (
        <div className={css("brief-secondary-actions")}>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={() => triage("mine")}
            isDisabled={pending != null}
          >
            {pending === "mine" ? (
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            This is mine
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => triage("not_mine")}
            isDisabled={pending != null}
          >
            {pending === "not_mine" ? (
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            Not mine
          </Button>
        </div>
      ) : null}
    </div>
  );
}
