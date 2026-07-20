import "server-only";

import { createHydraRun, ensureHydraSetup } from "@/services/hydra";
import { executeHydraRun } from "./orchestrator";

function partsInTimezone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: value("weekday"),
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

export async function runDueHydraSchedules(now = new Date()) {
  const setup = await ensureHydraSetup();
  const executions: {
    scheduleId: number;
    runId: number;
    created: boolean;
    status: string;
  }[] = [];

  for (const schedule of setup.schedules.filter((entry) => entry.enabled)) {
    const local = partsInTimezone(now, schedule.timezone);
    if (["Sat", "Sun"].includes(local.weekday)) continue;
    const minuteOfDay = local.hour * 60 + local.minute;
    const target = schedule.hour * 60 + schedule.minute;
    if (minuteOfDay < target || minuteOfDay >= target + 15) continue;

    const scheduledFor = `${local.date}T${String(schedule.hour).padStart(2, "0")}:${String(
      schedule.minute
    ).padStart(2, "0")}:00[${schedule.timezone}]`;
    const result = await createHydraRun({
      runType: schedule.type,
      scheduledFor,
      idempotencyKey: `${setup.task.id}:${schedule.type}:${local.date}`,
    });
    const execution = await executeHydraRun(result.run.id);
    executions.push({
      scheduleId: schedule.id,
      runId: result.run.id,
      created: result.created,
      status: execution.run?.status ?? "failed",
    });
  }
  return executions;
}
