import { NextResponse } from "next/server";
import { CONNECTION_PROVIDERS } from "@/lib/connectors/providers";
import { syncProvider } from "@/lib/imports/syncProvider";
import { discoverProjectsFromSignals } from "@/lib/projects/discoverer";
import { approveAllPendingExtractions } from "@/lib/tasks/approvePending";
import { backfillUnextractedSources } from "@/lib/imports/backfillExtractions";
import { fetchJiraPendingSnapshot } from "@/lib/connectors/jiraPending";
import { buildTodayBriefing } from "@/lib/tasks/todayBriefing";
import { rebuildTodayQueue } from "@/lib/tasks/prioritizer";
import { getConnections } from "@/services/connections";

/**
 * The morning "Sync my day" flow: pull signals from every connected source,
 * extract tasks and knowledge directly into the Today queue, then re-plan.
 */
export async function POST() {
  await approveAllPendingExtractions();

  const connections = await getConnections();
  const connectedProviders = CONNECTION_PROVIDERS.filter((provider) =>
    connections.some(
      (connection) => connection.provider === provider && connection.status === "connected"
    )
  );

  let projectDiscovery = await discoverProjectsFromSignals(connectedProviders);

  const providerResults: {
    provider: string;
    ok: boolean;
    imported: number;
    skipped: number;
    tasksExtracted: number;
    knowledgeExtracted: number;
    error: string | null;
    importedItems: { title: string; url: string | null; sourceType: string; metadata: Record<string, unknown> }[];
  }[] = [];

  for (const provider of connectedProviders) {
    const outcome = await syncProvider(provider);
    if (outcome.ok) {
      providerResults.push({
        provider,
        ok: true,
        imported: outcome.result.imported,
        skipped: outcome.result.skipped,
        tasksExtracted: outcome.result.tasksExtracted,
        knowledgeExtracted: outcome.result.knowledgeExtracted.length,
        error: outcome.result.errors[0] ?? null,
        importedItems: outcome.result.importedItems,
      });
    } else {
      providerResults.push({
        provider,
        ok: false,
        imported: 0,
        skipped: 0,
        tasksExtracted: 0,
        knowledgeExtracted: 0,
        error: outcome.error,
        importedItems: [],
      });
    }
  }

  const totalImported = providerResults.reduce((sum, entry) => sum + entry.imported, 0);
  const backfill = await backfillUnextractedSources();
  const jiraPending = await fetchJiraPendingSnapshot();

  if (totalImported > 0) {
    const afterImport = await discoverProjectsFromSignals(connectedProviders);
    projectDiscovery = {
      ...afterImport,
      created: projectDiscovery.created + afterImport.created,
      updated: projectDiscovery.updated + afterImport.updated,
      errors: [...projectDiscovery.errors, ...afterImport.errors],
      signalCount: Math.max(projectDiscovery.signalCount, afterImport.signalCount),
      ok: projectDiscovery.ok && afterImport.ok,
    };
  }

  const rebuild = await rebuildTodayQueue();
  const briefingResult = await buildTodayBriefing();

  const granolaMeetings = providerResults
    .filter((entry) => entry.provider === "granola")
    .flatMap((entry) => entry.importedItems)
    .map((item) => ({
      title: item.title,
      url: item.url,
      summary: (item.metadata.summary as string | null) ?? null,
      participants: (item.metadata.participants as string[] | null) ?? [],
    }));

  return NextResponse.json({
    ok: rebuild.ok,
    granolaMeetings,
    briefing: briefingResult.ok
      ? {
          ok: true,
          generated: Boolean(briefingResult.briefing),
          risks: briefingResult.briefing?.risks ?? [],
          waitingOn: briefingResult.briefing?.waitingOn ?? [],
          focusCount: briefingResult.briefing?.focusItems.length ?? 0,
          error: undefined,
        }
      : { ok: false, error: briefingResult.error ?? "Briefing failed." },
    projects: {
      ok: projectDiscovery.ok,
      created: projectDiscovery.created,
      updated: projectDiscovery.updated,
      signalCount: projectDiscovery.signalCount,
      errors: projectDiscovery.errors,
    },
    providers: providerResults,
    imported: providerResults.reduce((sum, entry) => sum + entry.imported, 0),
    tasksExtracted:
      providerResults.reduce((sum, entry) => sum + entry.tasksExtracted, 0) +
      backfill.tasksExtracted,
    knowledgeExtracted:
      providerResults.reduce((sum, entry) => sum + entry.knowledgeExtracted, 0) +
      backfill.knowledgeExtracted,
    backfill: {
      sourcesProcessed: backfill.sourcesProcessed,
      sourcesRemaining: backfill.sourcesRemaining,
      errors: backfill.errors.slice(0, 3),
    },
    jiraPendingCount: jiraPending.length,
    rebuild: rebuild.ok
      ? { status: "completed", updatedTaskCount: rebuild.updatedTaskCount }
      : { status: "failed", error: rebuild.error ?? "Queue rebuild failed." },
  });
}
