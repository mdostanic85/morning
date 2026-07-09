import { Suspense } from "react";
import { getTodayQueue } from "@/services/workTasks";
import { getProjects } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import { getConnections } from "@/services/connections";
import { getUserProfile } from "@/services/userProfile";
import { TodayWelcome } from "@/components/TodayWelcome";
import { TodayFilteredView } from "@/components/TodayFilteredView";
import { getTodayBriefing } from "@/lib/tasks/todayBriefing";
import { getResumeFromYesterday } from "@/lib/tasks/dailyMemory";
import { dayGreeting } from "@/lib/dates";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import type { ConnectionProvider } from "@/lib/connectors/providers";

export const dynamic = "force-dynamic";

const CONNECTED_PROVIDER_LABEL: Record<ConnectionProvider, string> = {
  gmail: "Gmail & Gemini notes",
  jira: "Jira",
  confluence: "Confluence",
  granola: "Granola",
  github: "GitHub",
  discord: "Discord",
  figma: "Figma",
};

function todayDateLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default async function TodayPage() {
  const [queue, projects, sourceItems, connections, profile, resumeMemory, todayBriefing] =
    await Promise.all([
      getTodayQueue(),
      getProjects(),
      getSourceItems(),
      getConnections(),
      getUserProfile(),
      getResumeFromYesterday(),
      getTodayBriefing(),
    ]);

  const myName = profile?.name?.trim() ?? null;
  const projectNameById = Object.fromEntries(projects.map((project) => [project.id, project.name]));
  const projectOptions = projects.map((project) => ({ id: project.id, name: project.name }));
  const sourceLookup = sourceItems.map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    sourceType: item.sourceType,
    sourceDate: item.sourceDate,
    url: item.url,
  }));

  const totalOpen = OPEN_QUEUE_STATUSES.reduce((sum, status) => sum + queue[status].length, 0);
  const isFreshStart = totalOpen === 0 && sourceItems.length === 0 && !todayBriefing;
  const connectedProviderLabels = connections
    .filter((connection) => connection.status === "connected")
    .map((connection) => CONNECTED_PROVIDER_LABEL[connection.provider as ConnectionProvider])
    .filter(Boolean);

  if (isFreshStart) {
    return (
      <TodayWelcome
        dateLabel={todayDateLabel()}
        greeting={dayGreeting()}
        connectedProviderLabels={connectedProviderLabels}
      />
    );
  }

  return (
    <Suspense fallback={null}>
      <TodayFilteredView
        dateLabel={todayDateLabel()}
        greeting={dayGreeting()}
        queue={queue}
        todayBriefing={todayBriefing}
        resumeMemory={resumeMemory}
        myName={myName}
        connectedProviderLabels={connectedProviderLabels}
        projectOptions={projectOptions}
        projectNameById={projectNameById}
        sourceLookup={sourceLookup}
      />
    </Suspense>
  );
}
