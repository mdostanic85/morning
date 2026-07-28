"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Switch } from "@heroui/react/switch";
import { Heading } from "@/components/Heading";

interface ScheduleData {
  id: number;
  type: "morning" | "evening";
  hour: number;
  minute: number;
  timezone: string;
  enabled: boolean;
}

function asTime(schedule: ScheduleData) {
  return `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
}

export function HydraScheduleSettings({ initialSchedules }: { initialSchedules: ScheduleData[] }) {
  const router = useRouter();
  const [schedules, setSchedules] = useState(initialSchedules);
  const [saving, setSaving] = useState<number | null>(null);

  async function save(schedule: ScheduleData) {
    setSaving(schedule.id);
    try {
      const response = await fetch(`/api/hydra/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hour: schedule.hour,
          minute: schedule.minute,
          timezone: schedule.timezone,
          enabled: schedule.enabled,
        }),
      });
      if (!response.ok) throw new Error("Schedule could not be saved.");
      Toast.toast.success(`${schedule.type === "morning" ? "Morning" : "Evening"} schedule saved`);
      router.refresh();
    } catch (error) {
      Toast.toast.danger(error instanceof Error ? error.message : "Schedule could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  function update(id: number, patch: Partial<ScheduleData>) {
    setSchedules((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {schedules.map((schedule) => (
        <section key={schedule.id} className="app-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div><p className="eyebrow">Weekdays</p><Heading level={2} visualLevel={4} className="mt-1 capitalize">{schedule.type} report</Heading></div>
            <Switch
              size="sm"
              isSelected={schedule.enabled}
              onChange={(enabled) => update(schedule.id, { enabled })}
              aria-label={`${schedule.type} schedule enabled`}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>
          <div className="mt-5 grid gap-4">
            <label><span className="text-metadata font-medium text-muted">Local time</span><Input className="mt-1.5" type="time" value={asTime(schedule)} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); update(schedule.id, { hour, minute }); }} /></label>
            <label><span className="text-metadata font-medium text-muted">Timezone</span><Input className="mt-1.5" value={schedule.timezone} onChange={(event) => update(schedule.id, { timezone: event.target.value })} /></label>
          </div>
          <p className="mt-4 text-metadata leading-relaxed text-muted">Runs Monday through Friday. Worklight skips duplicate reports for the same date and report type.</p>
          <Button className="mt-5 min-h-11 w-full" variant="outline" onClick={() => save(schedule)} isDisabled={saving === schedule.id}>{saving === schedule.id ? "Saving..." : "Save schedule"}</Button>
        </section>
      ))}
    </div>
  );
}
