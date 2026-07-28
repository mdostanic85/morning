export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId: string | null;
}

/** Normalize `1-2` or `1:2` to Figma's colon form. */
export function normalizeFigmaNodeId(value: string): string {
  return value.trim().replace("-", ":");
}

/**
 * Extract file key and optional node id from a Figma design URL.
 * Supports `/design/:fileKey/...` and branch URLs (`.../branch/:branchKey/...`).
 */
export function parseFigmaUrl(url: string): ParsedFigmaUrl | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname.includes("figma.com")) return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    let fileKey: string | null = null;

    if (parts[0] === "design" && parts[1]) {
      fileKey = parts[2] === "branch" && parts[3] ? parts[3] : parts[1];
    }

    if (!fileKey) return null;

    const nodeIdRaw = parsed.searchParams.get("node-id");
    const nodeId = nodeIdRaw ? normalizeFigmaNodeId(nodeIdRaw) : null;

    return { fileKey, nodeId };
  } catch {
    return null;
  }
}

export function figmaDesignUrl(fileKey: string, nodeId?: string | null): string {
  const base = `https://www.figma.com/design/${fileKey}`;
  if (!nodeId) return base;
  return `${base}?node-id=${nodeId.replace(":", "-")}`;
}

/**
 * Scans arbitrary text strings for figma.com URLs and returns every unique
 * file key found. Matches both `/design/:key` and legacy `/file/:key` paths,
 * including branch URLs.
 */
export function extractAllFigmaFileKeys(texts: string[]): string[] {
  const keys = new Set<string>();
  const regex = /figma\.com\/(?:design|file)\/([a-zA-Z0-9]{10,})/g;
  for (const text of texts) {
    for (const match of text.matchAll(regex)) {
      keys.add(match[1]);
    }
  }
  return Array.from(keys);
}
