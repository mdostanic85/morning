import type { SourceType } from "./sourceItem";

/**
 * WL-08: a user-authored constraint on extraction, scoped to a connector
 * (`sourceType`), a project, both, or neither (global). Never a source of
 * facts by itself — it only steers whether/how extraction runs.
 */
export interface IngestionRule {
  id: number;
  /** Null = applies to every connector. */
  sourceType: SourceType | null;
  /** Null = applies to every project. */
  projectId: number | null;
  rule: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NewIngestionRule = Pick<IngestionRule, "rule"> &
  Partial<Pick<IngestionRule, "sourceType" | "projectId" | "active">>;
