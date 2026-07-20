import "server-only";
import { getConnectionSecret } from "@/services/connectionSecrets";
import { fetchWithTimeout } from "@/lib/http";
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
