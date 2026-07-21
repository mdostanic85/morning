import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ingestionRules as ingestionRulesTable } from "@/db/tables";
import { fetchAll, fetchOne, execute, fetchReturning } from "@/db/query";
import type { IngestionRule, NewIngestionRule } from "@/domain/ingestionRule";
import { applicableIngestionRules, type IngestionRuleScopeInput } from "@/lib/tasks/ingestionRuleMatch";

function toIngestionRule(row: typeof ingestionRulesTable.$inferSelect): IngestionRule {
  return {
    id: row.id,
    sourceType: row.sourceType,
    projectId: row.projectId,
    rule: row.rule,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listIngestionRules(): Promise<IngestionRule[]> {
  const rows = await fetchAll(
    db.select().from(ingestionRulesTable).orderBy(desc(ingestionRulesTable.createdAt))
  );
  return rows.map(toIngestionRule);
}

export async function createIngestionRule(input: NewIngestionRule): Promise<IngestionRule> {
  const trimmed = input.rule.trim();
  if (!trimmed) {
    throw new Error("Ingestion rule text cannot be empty.");
  }
  const [row] = await fetchReturning(
    db
      .insert(ingestionRulesTable)
      .values({
        sourceType: input.sourceType ?? null,
        projectId: input.projectId ?? null,
        rule: trimmed,
        active: input.active ?? true,
      })
      .returning()
  );
  return toIngestionRule(row);
}

export async function setIngestionRuleActive(id: number, active: boolean): Promise<IngestionRule | null> {
  const [row] = await fetchReturning(
    db
      .update(ingestionRulesTable)
      .set({ active, updatedAt: new Date().toISOString() })
      .where(eq(ingestionRulesTable.id, id))
      .returning()
  );
  return row ? toIngestionRule(row) : null;
}

export async function deleteIngestionRule(id: number): Promise<void> {
  await execute(db.delete(ingestionRulesTable).where(eq(ingestionRulesTable.id, id)));
}

export async function getIngestionRuleById(id: number): Promise<IngestionRule | null> {
  const row = await fetchOne(db.select().from(ingestionRulesTable).where(eq(ingestionRulesTable.id, id)));
  return row ? toIngestionRule(row) : null;
}

/** Active rules in scope for one source — the only entry point `extractor.ts` needs. */
export async function getApplicableIngestionRules(
  scope: IngestionRuleScopeInput
): Promise<IngestionRule[]> {
  const rows = await fetchAll(
    db.select().from(ingestionRulesTable).where(eq(ingestionRulesTable.active, true))
  );
  return applicableIngestionRules(rows.map(toIngestionRule), scope);
}
