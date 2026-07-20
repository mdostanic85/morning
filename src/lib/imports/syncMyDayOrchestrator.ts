import "server-only";

import { getSyncRunById, listSyncProviderRuns } from "@/services/syncRuns";

export async function getSyncMyDayStatus(syncRunId: number) {
  const syncRun = await getSyncRunById(syncRunId);
  if (!syncRun) return null;
  const providerRuns = await listSyncProviderRuns(syncRunId);
  return { syncRun, providerRuns };
}
