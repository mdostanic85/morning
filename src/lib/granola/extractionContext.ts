import "server-only";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import { buildGranolaWorkContext, type GranolaWorkContext } from "@/lib/granola/personalKnowledge";
import { getActiveProjects } from "@/services/projects";
import { getUserProfile } from "@/services/userProfile";
import { getTodayQueue } from "@/services/workTasks";

export async function loadGranolaExtractionContext(): Promise<GranolaWorkContext | null> {
  const [profile, projects, queue] = await Promise.all([
    getUserProfile(),
    getActiveProjects(),
    getTodayQueue(),
  ]);

  const myName = profile?.name?.trim();
  if (!myName) return null;

  const taskTitles = OPEN_QUEUE_STATUSES.flatMap((status) => queue[status]).map(
    (task) => task.title
  );

  return buildGranolaWorkContext({ myName, projects, taskTitles });
}
