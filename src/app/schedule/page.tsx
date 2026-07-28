import { HydraConfigForm } from "@/components/HydraConfigForm";
import { HydraRunNowButton } from "@/components/HydraRunNowButton";
import { HydraScheduleSettings } from "@/components/HydraScheduleSettings";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { ensureHydraSetup } from "@/services/hydra";
import Link from "next/link";
import { Heading } from "@/components/Heading";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const setup = await ensureHydraSetup();
  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <SettingsBackLink section="Automation" />
          <Heading level={1} visualLevel={2} className="mt-2">Schedule</Heading>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Choose when weekday reports run in your timezone. A manual report will not change the
            next scheduled time.{" "}
            <Link href="/reports" className="text-accent hover:underline">
              Report history
            </Link>
          </p>
        </div>
        <HydraRunNowButton />
      </header>
      <HydraScheduleSettings initialSchedules={setup.schedules.map((schedule) => ({ id: schedule.id, type: schedule.type, hour: schedule.hour, minute: schedule.minute, timezone: schedule.timezone, enabled: schedule.enabled }))} />
      <HydraConfigForm config={setup.task.config} deliverySettings={setup.task.deliverySettings} />
    </div>
  );
}
