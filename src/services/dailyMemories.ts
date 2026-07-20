import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyMemories as dailyMemoriesTable } from "@/db/tables";
import { fetchOne, fetchReturning } from "@/db/query";
import type { DailyMemory, NewDailyMemory } from "@/domain/dailyMemory";

function toDailyMemory(row: typeof dailyMemoriesTable.$inferSelect): DailyMemory {
  return {
    id: row.id,
    date: row.date,
    whatWorkedOn: row.whatWorkedOn ?? [],
    completed: row.completed ?? [],
    stillOpen: row.stillOpen ?? [],
    waitingOn: row.waitingOn ?? [],
    firstTomorrow: row.firstTomorrow,
    risks: row.risks ?? [],
    summary: row.summary,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

export async function createDailyMemory(input: NewDailyMemory): Promise<DailyMemory> {
  const [row] = await fetchReturning(
    db
      .insert(dailyMemoriesTable)
      .values({
        date: input.date,
        whatWorkedOn: input.whatWorkedOn,
        completed: input.completed,
        stillOpen: input.stillOpen,
        waitingOn: input.waitingOn,
        firstTomorrow: input.firstTomorrow ?? null,
        risks: input.risks ?? [],
        summary: input.summary,
        confidence: input.confidence ?? null,
      })
      .returning()
  );
  return toDailyMemory(row);
}

export async function getLatestDailyMemory(): Promise<DailyMemory | null> {
  const row = await fetchOne(db.select().from(dailyMemoriesTable).orderBy(desc(dailyMemoriesTable.createdAt)));
  return row ? toDailyMemory(row) : null;
}

export async function getDailyMemoryByDate(date: string): Promise<DailyMemory | null> {
  const row = await fetchOne(db.select().from(dailyMemoriesTable).where(eq(dailyMemoriesTable.date, date)));
  return row ? toDailyMemory(row) : null;
}
