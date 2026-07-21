// A source item is any ingested signal — connector-agnostic. The manual
// transcript connector is the only producer of these in the MVP; future
// connectors (Gmail, Jira, Confluence, Granola, GitHub, Figma, Discord, git)
// will produce the same shape.

export const SOURCE_TYPES = [
  "manual_transcript",
  "gmail",
  "calendar",
  "drive",
  "jira",
  "confluence",
  "granola",
  "github",
  "figma",
  "discord",
  "git",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface SourceItem {
  id: number;
  projectId: number | null;
  sourceType: SourceType;
  sourceExternalId: string | null;
  title: string;
  body: string;
  author: string | null;
  sourceDate: string;
  url: string | null;
  metadata: Record<string, unknown> | null;
  /** sha256 of (title, body, author, sourceDate, url) — real-change detection independent of the extraction-skip fingerprint (WL-03). */
  contentHash: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export type NewSourceItem = Pick<SourceItem, "sourceType" | "title" | "body" | "sourceDate"> &
  Partial<
    Pick<
      SourceItem,
      "projectId" | "sourceExternalId" | "author" | "url" | "metadata" | "contentHash"
    >
  >;
