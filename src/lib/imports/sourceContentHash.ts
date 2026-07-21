import { createHash } from "node:crypto";

export interface SourceContentFields {
  title: string;
  body: string;
  author?: string | null;
  sourceDate: string;
  url?: string | null;
}

/**
 * Real-change fingerprint for a source item's substantive fields (WL-03).
 * Deliberately narrower than `sourceProcessing.ts`'s extraction-skip
 * fingerprint (which also folds in `projectId`) — this hash exists purely to
 * decide when a body edit is worth recording as a revision.
 */
export function computeSourceContentHash(input: SourceContentFields): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title,
        body: input.body,
        author: input.author ?? null,
        sourceDate: input.sourceDate,
        url: input.url ?? null,
      })
    )
    .digest("hex");
}
