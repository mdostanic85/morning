import { inngest } from "../client";
import { recoverStaleSyncRuns } from "@/services/syncRuns";

export const staleSyncRunRecovery = inngest.createFunction(
  {
    id: "recover-stale-sync-runs",
    name: "Recover stale sync runs",
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) =>
    step.run("finalize-stale-sync-runs", () => recoverStaleSyncRuns())
);
