import "server-only";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/db/client";
import { dailyBriefs as dailyBriefsTable } from "@/db/tables";
import { fetchOne, execute, fetchReturning } from "@/db/query";
import {
  dailyBriefV2Schema,
  type DailyBriefV2,
} from "@/domain/dailyBrief";
import { localDateString } from "@/lib/dates";
import { composeDailyBriefV2, validateDailyBriefCitations } from "@/lib/dailyBrief/composer";
import { getTodayQueue } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { getUserProfile } from "@/services/userProfile";
import { getTodayMeetings } from "@/lib/calendar/todayMeetings";
import {
  fetchJiraPendingSnapshot,
  type JiraPendingSnapshot,
} from "@/lib/connectors/jiraPending";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import type { AttendanceContext } from "@/lib/tasks/sourceAuthority";
import { resolveCanonicalKeyForTask } from "@/lib/tasks/canonicalKey";

const BRIEF_PATH = path.join(process.cwd(), "data", "daily-brief-v2.json");

function writeShadowFile(brief: DailyBriefV2) {
  const dir = path.dirname(BRIEF_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BRIEF_PATH, JSON.stringify(brief, null, 2));
}

function readShadowFile(today: string): DailyBriefV2 | null {
  if (!fs.existsSync(BRIEF_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(BRIEF_PATH, "utf-8"));
    const parsed = dailyBriefV2Schema.safeParse(raw);
    if (!parsed.success) return null;
    if (parsed.data.today !== today) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function getTodayDailyBrief(today = localDateString()): Promise<DailyBriefV2 | null> {
  try {
    const row = await fetchOne(
      db.select().from(dailyBriefsTable).where(eq(dailyBriefsTable.today, today))
    );
    if (row?.structuredJson) {
      const parsed = dailyBriefV2Schema.safeParse(row.structuredJson);
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Table may not exist yet — fall through to shadow file.
  }
  return readShadowFile(today);
}

export async function upsertDailyBrief(brief: DailyBriefV2, meta?: {
  modelProvider?: string | null;
  modelName?: string | null;
  promptVersion?: string | null;
  validationOk?: boolean;
}): Promise<void> {
  writeShadowFile(brief);
  const now = new Date().toISOString();
  try {
    const existing = await fetchOne(
      db.select().from(dailyBriefsTable).where(eq(dailyBriefsTable.today, brief.today))
    );
    if (existing) {
      await execute(
        db
          .update(dailyBriefsTable)
          .set({
            schemaVersion: brief.schemaVersion,
            inputHash: brief.inputHash,
            structuredJson: brief,
            modelProvider: meta?.modelProvider ?? null,
            modelName: meta?.modelName ?? null,
            promptVersion: meta?.promptVersion ?? null,
            validationOk: meta?.validationOk ?? true,
            updatedAt: now,
          })
          .where(eq(dailyBriefsTable.today, brief.today))
      );
    } else {
      await fetchReturning(
        db
          .insert(dailyBriefsTable)
          .values({
            today: brief.today,
            schemaVersion: brief.schemaVersion,
            inputHash: brief.inputHash,
            structuredJson: brief,
            modelProvider: meta?.modelProvider ?? null,
            modelName: meta?.modelName ?? null,
            promptVersion: meta?.promptVersion ?? null,
            validationOk: meta?.validationOk ?? true,
          })
          .returning()
      );
    }
  } catch (error) {
    console.warn("[dailyBrief] DB upsert failed; shadow JSON retained", error);
  }
}

export async function buildDailyBriefV2(options?: {
  today?: string;
  jiraPending?: JiraPendingSnapshot[];
}): Promise<{ ok: boolean; brief?: DailyBriefV2; error?: string }> {
  const today = options?.today ?? localDateString();
  try {
    const [queue, sources, profile, meetingsResult, jiraPending] = await Promise.all([
      getTodayQueue(),
      getSourceItems(),
      getUserProfile(),
      getTodayMeetings(),
      options?.jiraPending
        ? Promise.resolve(options.jiraPending)
        : fetchJiraPendingSnapshot(),
    ]);

    const myName = profile?.name ?? null;
    const tasks = OPEN_QUEUE_STATUSES.flatMap((status) => queue[status]).map((task) => ({
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      status: task.status,
      reason: task.reason,
      nextAction: task.nextAction,
      doneCriteria: task.doneCriteria,
      priorityScore: task.priorityScore,
      dueDate: task.dueDate,
      waitingOn: task.waitingOn,
      statusManuallySet: task.statusManuallySet,
      owner: task.owner,
      confidence: task.confidence,
      canonicalKey:
        task.canonicalKey ??
        resolveCanonicalKeyForTask({ title: task.title }),
      evidence: task.evidence.map((item) => ({
        sourceItemId: item.sourceItemId,
        quote: item.quote,
        summary: item.summary,
      })),
    }));

    const attendance: AttendanceContext = {
      myName,
      myEmail: profile?.email ?? null,
    };

    const previous = await getTodayDailyBrief(
      // previous calendar day is not required for dayChange from Jira assignment
      today
    );
    const previousBrief = previous
      ? {
          todayFirstJiraKey: previous.todayFirst.jiraKey,
          todayFirstTitle: previous.todayFirst.title,
        }
      : null;

    const brief = composeDailyBriefV2({
      today,
      tasks,
      sources,
      jiraPending,
      meetings: meetingsResult.meetings.map((meeting) => ({
        title: meeting.title,
        startAt: meeting.startsAt ?? null,
      })),
      attendance,
      previousBrief,
      myName,
    });

    const knownIds = new Set(sources.map((source) => source.id));
    const validation = validateDailyBriefCitations(brief, knownIds);
    await upsertDailyBrief(brief, {
      modelProvider: "deterministic",
      modelName: "daily_brief_v2_composer",
      promptVersion: "v1-deterministic",
      validationOk: validation.ok,
    });

    console.info(
      JSON.stringify({
        type: "llm_job_audit",
        jobType: "daily_brief_v2",
        provider: "deterministic",
        model: "daily_brief_v2_composer",
        promptVersion: "v1-deterministic",
        inputHash: brief.inputHash,
        validationOk: validation.ok,
        validationErrors: validation.errors,
      })
    );

    return { ok: true, brief };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Daily brief failed",
    };
  }
}
