import "server-only";
import { createHash } from "node:crypto";
import type { SourceItem } from "@/domain/sourceItem";
import { updateSourceItem } from "@/services/sourceItems";

export const SOURCE_PROCESSING_METADATA_KEY = "_worklightProcessing";
export const SOURCE_PROCESSING_VERSION = 1;

export type ProcessingStatus = "completed" | "skipped" | "failed";

interface SourceProcessingMetadata {
  version: number;
  fingerprint: string;
  taskStatus: ProcessingStatus;
  knowledgeStatus: ProcessingStatus;
  processedAt: string;
}

export function sourceProcessingFingerprint(source: SourceItem): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceType: source.sourceType,
        title: source.title,
        body: source.body,
        author: source.author,
        sourceDate: source.sourceDate,
        projectId: source.projectId,
      })
    )
    .digest("hex");
}

export function getSourceProcessingMetadata(
  source: SourceItem
): SourceProcessingMetadata | null {
  const raw = source.metadata?.[SOURCE_PROCESSING_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<SourceProcessingMetadata>;
  if (
    value.version !== SOURCE_PROCESSING_VERSION ||
    typeof value.fingerprint !== "string" ||
    typeof value.taskStatus !== "string" ||
    typeof value.knowledgeStatus !== "string" ||
    typeof value.processedAt !== "string"
  ) {
    return null;
  }
  return value as SourceProcessingMetadata;
}

export function sourceProcessingIsCurrent(source: SourceItem): boolean {
  const processing = getSourceProcessingMetadata(source);
  if (!processing || processing.fingerprint !== sourceProcessingFingerprint(source)) {
    return false;
  }
  return (
    processing.taskStatus !== "failed" &&
    processing.knowledgeStatus !== "failed"
  );
}

export async function markSourceProcessed(
  source: SourceItem,
  statuses: {
    taskStatus: ProcessingStatus;
    knowledgeStatus: ProcessingStatus;
  }
): Promise<void> {
  await updateSourceItem(source.id, {
    metadata: {
      ...(source.metadata ?? {}),
      [SOURCE_PROCESSING_METADATA_KEY]: {
        version: SOURCE_PROCESSING_VERSION,
        fingerprint: sourceProcessingFingerprint(source),
        taskStatus: statuses.taskStatus,
        knowledgeStatus: statuses.knowledgeStatus,
        processedAt: new Date().toISOString(),
      } satisfies SourceProcessingMetadata,
    },
  });
}
