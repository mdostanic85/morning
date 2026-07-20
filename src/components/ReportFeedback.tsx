"use client";

import { useState } from "react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";

const RATINGS = [
  ["useful", "Useful"],
  ["incorrect", "Incorrect"],
  ["outdated", "Outdated"],
  ["missing_source", "Missing source"],
] as const;

export function ReportFeedback({ reportId }: { reportId: number }) {
  const [sending, setSending] = useState<string | null>(null);
  async function send(rating: (typeof RATINGS)[number][0]) {
    setSending(rating);
    try {
      const response = await fetch(`/api/reports/${reportId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "overall", rating }),
      });
      if (!response.ok) throw new Error("Feedback could not be saved.");
      Toast.toast.success("Feedback saved");
    } catch (error) {
      Toast.toast.danger(error instanceof Error ? error.message : "Feedback could not be saved.");
    } finally {
      setSending(null);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm text-muted">How was this report?</span>
      {RATINGS.map(([value, label]) => (
        <Button key={value} variant="outline" size="sm" isDisabled={sending != null} onClick={() => send(value)}>
          {sending === value ? "Saving…" : label}
        </Button>
      ))}
    </div>
  );
}
