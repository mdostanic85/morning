import "server-only";
import { getConnectionSecret } from "@/services/connectionSecrets";
import { fetchWithTimeout } from "@/lib/http";
import { shapeFigmaCommentCandidates } from "./figmaComments";
import { figmaDesignUrl } from "./figmaUrl";
import type { ConnectorSourceCandidate } from "./types";

export interface FigmaFrameEvidence {
  fileKey: string;
  nodeId: string;
  frameUrl: string;
  metadata: string;
  designContext: string;
  screenshotNote: string | null;
  screenshotUrl: string | null;
}

interface FigmaApiError {
  err?: string;
  status?: number;
}

interface FigmaUser {
  email?: string;
  handle?: string;
}

interface FigmaNode {
  id?: string;
  name?: string;
  type?: string;
  characters?: string;
  children?: FigmaNode[];
}

interface FigmaFileResponse {
  name?: string;
  lastModified?: string;
  document?: FigmaNode;
}

interface FigmaNodesResponse {
  nodes?: Record<
    string,
    {
      document?: FigmaNode;
      components?: Record<string, { name?: string; description?: string }>;
      styles?: Record<string, { name?: string; description?: string }>;
    } | null
  >;
}

interface FigmaImagesResponse {
  images?: Record<string, string | null>;
}

// ---- Comment types (Figma REST API) ----

interface FigmaCommentClientMeta {
  /** Node ID the comment is pinned to (FrameOffset / FrameOffsetRegion). */
  node_id?: string;
  node_offset?: { x: number; y: number };
  /** Canvas-absolute coordinates (Vector / Region). */
  x?: number;
  y?: number;
  region_height?: number;
  region_width?: number;
}

interface FigmaComment {
  id: string;
  /** Present on replies; root comments have no parent_id. */
  parent_id?: string;
  message: string;
  file_key: string;
  user: { id?: string; handle?: string; email?: string };
  created_at: string;
  resolved_at?: string | null;
  /** Only set on root (top-level) comments. */
  order_id?: number;
  client_meta?: FigmaCommentClientMeta;
}

interface FigmaCommentsResponse {
  comments?: FigmaComment[];
  err?: string;
}

async function getToken(): Promise<string> {
  const secret = await getConnectionSecret("figma");
  const token = secret?.pat ?? secret?.accessToken;
  if (!token) throw new Error("Figma token is not configured.");
  return token;
}

async function figmaFetch<T>(path: string): Promise<T> {
  const token = await getToken();
  const response = await fetchWithTimeout(`https://api.figma.com${path}`, {
    headers: { "X-Figma-Token": token },
  });
  const body = (await response.json()) as T & FigmaApiError;
  if (!response.ok) {
    throw new Error(body.err ?? `Figma request failed for ${path}.`);
  }
  return body;
}

export async function testFigmaConnection(): Promise<string> {
  const user = await figmaFetch<FigmaUser>("/v1/me");
  return user.handle ?? user.email ?? "connected";
}

function resolveFileKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("figma.com")) {
    const match = trimmed.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  }
  return trimmed;
}

function formatNodeTree(node: FigmaNode | undefined, depth = 0): string {
  if (!node) return "";
  const indent = "  ".repeat(depth);
  const nodeId = node.id ? ` [node-id=${node.id}]` : "";
  const label = `${[node.type, node.name].filter(Boolean).join(" — ")}${nodeId}`;
  const text =
    node.type === "TEXT" && node.characters
      ? `${indent}${label}: "${node.characters.trim()}"`
      : `${indent}${label}`;
  const children = (node.children ?? [])
    .map((child) => formatNodeTree(child, depth + 1))
    .filter(Boolean)
    .join("\n");
  return children ? `${text}\n${children}` : text;
}

function summarizeComponents(
  components: Record<string, { name?: string; description?: string }> | undefined
): string {
  if (!components) return "";
  const lines = Object.entries(components)
    .map(([, component]) => {
      const parts = [component.name, component.description].filter(Boolean);
      return parts.length > 0 ? `- ${parts.join(" — ")}` : null;
    })
    .filter(Boolean);
  return lines.length > 0 ? `Components:\n${lines.join("\n")}` : "";
}

export async function fetchFigmaFileIfUpdated(input: {
  fileKey: string;
  updatedSinceIso?: string;
}): Promise<ConnectorSourceCandidate[]> {
  const fileKey = resolveFileKey(input.fileKey);
  if (!fileKey) return [];

  const meta = await figmaFetch<FigmaFileResponse>(
    `/v1/files/${encodeURIComponent(fileKey)}?depth=1`
  );
  const lastModified = meta.lastModified ?? null;
  if (
    input.updatedSinceIso &&
    lastModified &&
    Date.parse(lastModified) < Date.parse(input.updatedSinceIso)
  ) {
    return [];
  }

  const file = await figmaFetch<FigmaFileResponse>(
    `/v1/files/${encodeURIComponent(fileKey)}?depth=2`
  );
  const body = [
    file.name ? `File: ${file.name}` : null,
    file.lastModified ? `Last modified: ${file.lastModified}` : null,
    formatNodeTree(file.document),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!body.trim()) return [];

  return [
    {
      sourceType: "figma",
      sourceExternalId: `${fileKey}:structure`,
      title: file.name ? `Figma file ${file.name}` : `Figma file ${fileKey}`,
      sourceDate: file.lastModified ?? new Date().toISOString(),
      url: figmaDesignUrl(fileKey),
      body,
      metadata: {
        transport: "api",
        fileKey,
        importedFrom: "figma",
      },
    },
  ];
}

export async function fetchFigmaFilesViaApi(input: {
  figmaFileKeys: string[];
}): Promise<ConnectorSourceCandidate[]> {
  const fileKeys = Array.from(
    new Set(input.figmaFileKeys.map(resolveFileKey).filter((key): key is string => Boolean(key)))
  );
  if (fileKeys.length === 0) return [];

  const candidates: ConnectorSourceCandidate[] = [];
  for (const fileKey of fileKeys) {
    try {
      const file = await figmaFetch<FigmaFileResponse>(
        `/v1/files/${encodeURIComponent(fileKey)}?depth=2`
      );
      const body = [
        file.name ? `File: ${file.name}` : null,
        file.lastModified ? `Last modified: ${file.lastModified}` : null,
        formatNodeTree(file.document),
      ]
        .filter(Boolean)
        .join("\n\n");
      if (!body.trim()) continue;

      candidates.push({
        sourceType: "figma",
        sourceExternalId: `${fileKey}:structure`,
        title: file.name ? `Figma file ${file.name}` : `Figma file ${fileKey}`,
        sourceDate: file.lastModified ?? new Date().toISOString(),
        url: figmaDesignUrl(fileKey),
        body,
        metadata: {
          transport: "api",
          fileKey,
          importedFrom: "figma",
        },
      });
    } catch {
      // Skip files the account cannot read.
    }
  }

  return candidates;
}

export async function fetchFigmaFrameEvidenceViaApi(input: {
  fileKey: string;
  nodeId: string;
  frameUrl: string;
}): Promise<FigmaFrameEvidence> {
  const response = await figmaFetch<FigmaNodesResponse>(
    `/v1/files/${encodeURIComponent(input.fileKey)}/nodes?ids=${encodeURIComponent(input.nodeId)}`
  );
  const nodeEntry = response.nodes?.[input.nodeId];
  const document = nodeEntry?.document;
  if (!document) {
    throw new Error("Figma returned no readable frame for that node id.");
  }

  const metadata = [
    `Node: ${document.name ?? "Untitled"} (${document.type ?? "UNKNOWN"})`,
    formatNodeTree(document),
    summarizeComponents(nodeEntry.components),
  ]
    .filter(Boolean)
    .join("\n\n");

  const designContext = [
    "Read-only Figma REST API snapshot (personal access token).",
    metadata,
  ].join("\n\n");
  let screenshotUrl: string | null = null;
  try {
    const imageResponse = await figmaFetch<FigmaImagesResponse>(
      `/v1/images/${encodeURIComponent(input.fileKey)}?ids=${encodeURIComponent(input.nodeId)}&format=png&scale=2`
    );
    screenshotUrl = imageResponse.images?.[input.nodeId] ?? null;
  } catch {
    // The structural audit can still run when Figma cannot render an image.
  }

  return {
    fileKey: input.fileKey,
    nodeId: input.nodeId,
    frameUrl: input.frameUrl,
    metadata,
    designContext,
    screenshotNote: null,
    screenshotUrl,
  };
}

/**
 * Fetch active (unresolved) Figma comments for a file and return them as
 * `ConnectorSourceCandidate` items, one per comment/reply.
 *
 * Requires `file_comments:read` scope on the personal access token. When the
 * token lacks that scope, Figma returns a 403; this is surfaced as a thrown
 * error so `syncResourceScopes` can record a provider sync error rather than
 * silently skipping comments.
 *
 * Replies inherit the root pin's node id and include the parent message so
 * merge can attach feedback to the same task as the thread (Figma's API omits
 * `client_meta` on replies).
 *
 * @param sinceIso  Only return comments whose `created_at` is at or after this
 *                  ISO timestamp. Resolved comments are always excluded.
 */
export async function fetchFigmaCommentsForFile(input: {
  fileKey: string;
  /** Optional: project to associate with resulting source candidates. */
  projectId?: number | null;
  /** ISO timestamp; comments older than this are skipped. */
  sinceIso?: string;
}): Promise<ConnectorSourceCandidate[]> {
  const response = await figmaFetch<FigmaCommentsResponse>(
    `/v1/files/${encodeURIComponent(input.fileKey)}/comments`
  );
  return shapeFigmaCommentCandidates({
    fileKey: input.fileKey,
    projectId: input.projectId,
    comments: response.comments ?? [],
    sinceIso: input.sinceIso,
  });
}
