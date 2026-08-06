/**
 * Read-only ownership audit against the live DB.
 *
 * Replays classifyTaskOwnership / decideTaskVisibility / partitionTasksByOwnership
 * over every open approved work task and reports whether the evidence-based
 * gate stopped the "Milos needs to…" false positives.
 *
 * Every statement is a SELECT. Nothing is written.
 *
 * Run: npx tsx scripts/auditTaskOwnership.mts
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import {
  classifyTaskOwnership,
  evidenceProvesMine,
  firstPersonCommitment,
  namedMeAsActor,
  type TaskOwnershipClass,
} from "../src/lib/filters/ownerFilter.ts";
import {
  decideTaskVisibility,
  partitionTasksByOwnership,
} from "../src/lib/tasks/taskVisibility.ts";

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const raw = readFileSync(".env.local", "utf8");
  const line = raw.split("\n").find((entry) => entry.trim().startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

/** Task ids the previous audit flagged as prose-only false "mine". */
const PROSE_FALSE_POSITIVE_IDS = [
  552, 535, 560, 559, 562, 563, 564, 565, 566, 567, 568, 534,
] as const;

const FOREIGN_OWNERS_OF_INTEREST = [
  "Erin Rose",
  "Matt Pettit",
  "Lucas Saeed",
  "Lucas Sellanes",
  "Nenad Veljkovic",
] as const;

type TaskRow = {
  id: number;
  title: string;
  status: string;
  owner: string | null;
  reason: string;
  nextAction: string;
  confidence: number | null;
  priorityScore: number | null;
  ownershipDecision: string | null;
};

type EvidenceRow = {
  taskId: number;
  quote: string | null;
};

function countBy<T extends string>(items: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return out;
}

function proseWouldHaveClaimedMine(
  task: TaskRow,
  myName: string
): boolean {
  const blob = [task.title, task.reason, task.nextAction].filter(Boolean).join("\n");
  return firstPersonCommitment(blob) || namedMeAsActor(blob, myName);
}

async function main() {
  const sql = postgres(loadDatabaseUrl(), { max: 1 });

  try {
    const profiles = await sql<{ name: string | null }[]>`
      SELECT name FROM user_profiles ORDER BY id ASC LIMIT 1
    `;
    const myName = profiles[0]?.name?.trim() || "Milos";

    const tasks = await sql<TaskRow[]>`
      SELECT
        id,
        title,
        status,
        owner,
        reason,
        next_action AS "nextAction",
        confidence,
        priority_score AS "priorityScore",
        ownership_decision AS "ownershipDecision"
      FROM work_tasks
      WHERE status <> 'done'
        AND review_status = 'approved'
      ORDER BY id ASC
    `;

    const evidence = await sql<EvidenceRow[]>`
      SELECT task_id AS "taskId", quote
      FROM evidence
      WHERE task_id IN ${sql(tasks.map((task) => task.id))}
    `;

    const quotesByTask = new Map<number, string[]>();
    for (const row of evidence) {
      const quote = row.quote?.trim();
      if (!quote) continue;
      const list = quotesByTask.get(row.taskId) ?? [];
      list.push(quote);
      quotesByTask.set(row.taskId, list);
    }

    type Enriched = TaskRow & {
      evidence: { quote: string | null }[];
      ownership: TaskOwnershipClass;
      visibilityReason: string;
      visible: boolean;
      proseOnlyClaim: boolean;
      evidenceProves: boolean;
      mineVia: "owner_field" | "evidence_quote" | "confirmed" | "none";
    };

    const enriched: Enriched[] = tasks.map((task) => {
      const quotes = quotesByTask.get(task.id) ?? [];
      const ownership = classifyTaskOwnership(
        {
          owner: task.owner,
          title: task.title,
          reason: task.reason,
          nextAction: task.nextAction,
          ownershipDecision: task.ownershipDecision as
            | "confirmed_mine"
            | "rejected_not_mine"
            | null,
          evidenceQuotes: quotes,
        },
        myName
      );
      const visibility = decideTaskVisibility(
        {
          id: task.id,
          owner: task.owner,
          confidence: task.confidence,
          priorityScore: task.priorityScore,
          ownershipDecision: task.ownershipDecision as
            | "confirmed_mine"
            | "rejected_not_mine"
            | null,
          title: task.title,
          reason: task.reason,
          nextAction: task.nextAction,
          evidence: quotes.map((quote) => ({ quote })),
        },
        myName
      );

      let mineVia: Enriched["mineVia"] = "none";
      if (ownership === "mine") {
        if (task.ownershipDecision === "confirmed_mine") mineVia = "confirmed";
        else if (task.owner?.trim()) mineVia = "owner_field";
        else if (evidenceProvesMine(quotes, myName)) mineVia = "evidence_quote";
      }

      return {
        ...task,
        evidence: quotes.map((quote) => ({ quote })),
        ownership,
        visibilityReason: visibility.reason,
        visible: visibility.visible,
        proseOnlyClaim: proseWouldHaveClaimedMine(task, myName),
        evidenceProves: evidenceProvesMine(quotes, myName),
        mineVia,
      };
    });

    const ownershipCounts = countBy(enriched.map((task) => task.ownership));
    const visibilityCounts = countBy(
      enriched.filter((task) => task.visible).map((task) => task.visibilityReason)
    );
    const partition = partitionTasksByOwnership(enriched, myName);

    const proseOnlyFalsePositives = enriched.filter(
      (task) =>
        task.proseOnlyClaim &&
        !task.owner?.trim() &&
        !task.evidenceProves &&
        task.ownershipDecision !== "confirmed_mine"
    );
    const proseOnlyStillMine = proseOnlyFalsePositives.filter(
      (task) => task.ownership === "mine"
    );
    const flaggedIds = new Set<number>(PROSE_FALSE_POSITIVE_IDS);
    const flagged = enriched.filter((task) => flaggedIds.has(task.id));

    const foreignOwnerCounts = new Map<string, number>();
    for (const task of enriched) {
      const owner = task.owner?.trim();
      if (!owner) continue;
      foreignOwnerCounts.set(owner, (foreignOwnerCounts.get(owner) ?? 0) + 1);
    }
    const topForeign = [...foreignOwnerCounts.entries()]
      .filter(([name]) => {
        const lower = name.toLowerCase();
        return !lower.startsWith(myName.toLowerCase().split(/\s+/)[0] ?? "");
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    const interestOwners = FOREIGN_OWNERS_OF_INTEREST.map((name) => {
      const rows = enriched.filter(
        (task) => (task.owner ?? "").trim().toLowerCase() === name.toLowerCase()
      );
      return {
        name,
        count: rows.length,
        asOther: rows.filter((task) => task.ownership === "other").length,
      };
    });

    // Owner field says "mine" but no source quote proves it — durable field
    // still wins today; these are candidates to inspect, not auto-clear.
    const mineOwnerWithoutEvidence = enriched.filter(
      (task) =>
        task.ownership === "mine" &&
        task.mineVia === "owner_field" &&
        !task.evidenceProves &&
        task.ownershipDecision !== "confirmed_mine"
    );

    // Foreign owner stamped, yet a quote would prove the work is the user's —
    // possible victims of the old merge overwrite.
    const foreignOwnerButEvidenceMine = enriched.filter(
      (task) =>
        task.ownership === "other" &&
        Boolean(task.owner?.trim()) &&
        task.evidenceProves
    );

    const mineBreakdown = countBy(
      enriched.filter((task) => task.ownership === "mine").map((task) => task.mineVia)
    );

    console.log(JSON.stringify({
      myName,
      openTaskCount: enriched.length,
      ownershipClass: {
        mine: ownershipCounts.mine ?? 0,
        other: ownershipCounts.other ?? 0,
        unclear: ownershipCounts.unclear ?? 0,
      },
      mineBreakdown,
      visibleCount: enriched.filter((task) => task.visible).length,
      visibilityReasons: visibilityCounts,
      partition: {
        mine: partition.mine.length,
        noOwner: partition.noOwner.length,
      },
      proseOnlyFalsePositives: {
        wouldHaveClaimedViaProse: proseOnlyFalsePositives.length,
        stillClassifiedMine: proseOnlyStillMine.length,
        nowUnclear: proseOnlyFalsePositives.filter((task) => task.ownership === "unclear")
          .length,
        nowOther: proseOnlyFalsePositives.filter((task) => task.ownership === "other")
          .length,
        stillMineIds: proseOnlyStillMine.map((task) => task.id),
      },
      flaggedTasks: flagged.map((task) => ({
        id: task.id,
        ownership: task.ownership,
        visibilityReason: task.visibilityReason,
        owner: task.owner,
        proseOnlyClaim: task.proseOnlyClaim,
        evidenceProves: task.evidenceProves,
        title: task.title,
        reasonPreview: task.reason.slice(0, 160),
      })),
      foreignOwnersOfInterest: interestOwners,
      topForeignOwners: topForeign,
      mineOwnerWithoutEvidence: {
        count: mineOwnerWithoutEvidence.length,
        sample: mineOwnerWithoutEvidence.slice(0, 12).map((task) => ({
          id: task.id,
          owner: task.owner,
          title: task.title,
          quoteCount: task.evidence.length,
        })),
      },
      foreignOwnerButEvidenceMine: {
        count: foreignOwnerButEvidenceMine.length,
        sample: foreignOwnerButEvidenceMine.slice(0, 12).map((task) => ({
          id: task.id,
          owner: task.owner,
          title: task.title,
        })),
      },
      backfillRecommendation:
        foreignOwnerButEvidenceMine.length > 0
          ? "Consider a one-off clear/reclassify of foreign-owned rows whose evidence quotes prove the work is the user's — likely victims of the old merge overwrite."
          : "No foreign-owned rows whose evidence still proves the work is the user's. Leave foreign owner stamps as-is; they already classify as other and stay off Today. A mass clear is optional hygiene, not required for correctness.",
      sampleNoOwner: partition.noOwner.slice(0, 8).map((task) => ({
        id: task.id,
        title: task.title,
        owner: task.owner,
        ownership: task.ownership,
      })),
      sampleMine: partition.mine.slice(0, 8).map((task) => ({
        id: task.id,
        title: task.title,
        owner: task.owner,
        mineVia: task.mineVia,
      })),
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
