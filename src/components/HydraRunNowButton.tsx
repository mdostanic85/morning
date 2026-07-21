"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlayIcon, XIcon } from "lucide-react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { HydraRunRail, HydraRunStatus } from "./HydraRunStatus";

type RunPayload = {
  run: { id: number; status: string; error?: string | null; warnings?: string[] };
  report?: { id: number } | null;
};

const TERMINAL = new Set(["completed", "partial", "failed", "cancelled"]);

export function HydraRunNowButton({ large = false }: { large?: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState<RunPayload["run"] | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  async function poll(runId: number) {
    const response = await fetch(`/api/reports/run/${runId}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as RunPayload;
    setRun(payload.run);
    if (!TERMINAL.has(payload.run.status)) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    router.refresh();
    if (payload.run.status === "failed") {
      Toast.toast.danger("Brief run failed", { description: payload.run.error ?? "Open run details for the failure." });
      return;
    }
    Toast.toast.success(payload.run.status === "partial" ? "Partial brief ready" : "Brief ready");
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Brief ready", { body: "Your evidence-backed daily brief is available." });
    }
  }

  async function start() {
    setStarting(true);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      const response = await fetch("/api/reports/run", { method: "POST" });
      const payload = (await response.json()) as RunPayload;
      if (!response.ok) throw new Error("Could not create the brief run.");
      setRun(payload.run);
      void fetch(`/api/reports/run/${payload.run.id}/execute`, { method: "POST" }).catch(() => null);
      await poll(payload.run.id);
      pollRef.current = setInterval(() => void poll(payload.run.id), 1000);
    } catch (error) {
      Toast.toast.danger(error instanceof Error ? error.message : "Could not start brief run.");
      setRun(null);
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!run) return;
    await fetch(`/api/reports/run/${run.id}`, { method: "DELETE" });
    await poll(run.id);
  }

  if (run && !TERMINAL.has(run.status)) {
    return (
      <div className="app-card w-full space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Brief run #{run.id}</p>
            <div className="mt-2"><HydraRunStatus status={run.status} /></div>
          </div>
          <Button variant="ghost" size="sm" onClick={cancel}>
            <XIcon /> Cancel
          </Button>
        </div>
        <HydraRunRail status={run.status} />
        <p className="text-sm text-muted">Sources are read-only. This run keeps its own evidence snapshot for replay and auditing.</p>
      </div>
    );
  }

  return (
    <Button size={large ? "lg" : "md"} onClick={start} isDisabled={starting}>
      <PlayIcon /> {starting ? "Queuing…" : "Run now"}
    </Button>
  );
}
