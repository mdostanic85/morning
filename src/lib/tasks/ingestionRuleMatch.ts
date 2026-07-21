/**
 * WL-08: pure scope-matching logic for ingestion rules, kept separate from
 * `services/ingestionRules.ts` (DB) so the actual decision of "does this
 * rule apply to this source" is unit-testable and auditable on its own.
 */
export interface IngestionRuleLike {
  sourceType: string | null;
  projectId: number | null;
  rule: string;
  active: boolean;
}

export interface IngestionRuleScopeInput {
  sourceType: string;
  projectId: number | null;
}

/** A rule applies when active, and its sourceType/projectId (if set) match the source. Null on either side means "any". */
export function ruleAppliesToSource(rule: IngestionRuleLike, source: IngestionRuleScopeInput): boolean {
  if (!rule.active) return false;
  if (rule.sourceType != null && rule.sourceType !== source.sourceType) return false;
  if (rule.projectId != null && rule.projectId !== source.projectId) return false;
  return true;
}

export function applicableIngestionRules<T extends IngestionRuleLike>(
  rules: T[],
  source: IngestionRuleScopeInput
): T[] {
  return rules.filter((rule) => ruleAppliesToSource(rule, source));
}
