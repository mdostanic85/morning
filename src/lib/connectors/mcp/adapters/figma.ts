import "server-only";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";
import type { FigmaFrameEvidence } from "@/lib/connectors/figma";
import { figmaDesignUrl, parseFigmaUrl } from "@/lib/connectors/figmaUrl";
import { callMcpTool, withMcpClient } from "../client";
import { asRecord } from "../parse";

export type { FigmaFrameEvidence };

const APP_ORIGIN = process.env.WORKLIGHT_APP_URL?.trim() || "http://localhost:3000";

const MCP_CLIENT_ARGS = {
  clientLanguages: "typescript",
  clientFrameworks: "react",
} as const;

function toolResultText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        const row = asRecord(item);
        return row?.type === "text" && typeof row.text === "string" ? row.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  const record = asRecord(raw);
  if (record && typeof record.text === "string") return record.text;
  return raw == null ? "" : JSON.stringify(raw, null, 2);
}

function toolResultImageDataUrl(raw: unknown): string | null {
  const entries = Array.isArray(raw)
    ? raw
    : Array.isArray(asRecord(raw)?.content)
      ? (asRecord(raw)?.content as unknown[])
      : [raw];
  for (const item of entries) {
    const row = asRecord(item);
    if (
      row?.type === "image" &&
      typeof row.data === "string" &&
      typeof row.mimeType === "string"
    ) {
      return `data:${row.mimeType};base64,${row.data}`;
    }
  }
  return null;
}

function resolveFileKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("figma.com")) {
    return parseFigmaUrl(trimmed)?.fileKey ?? null;
  }
  return trimmed;
}

export async function fetchFigmaFilesViaMcp(input: {
  figmaFileKeys: string[];
}): Promise<ConnectorSourceCandidate[]> {
  const fileKeys = Array.from(
    new Set(input.figmaFileKeys.map(resolveFileKey).filter((key): key is string => Boolean(key)))
  );
  if (fileKeys.length === 0) return [];

  return withMcpClient("figma", APP_ORIGIN, async (client) => {
    const candidates: ConnectorSourceCandidate[] = [];

    for (const fileKey of fileKeys) {
      try {
        const raw = await callMcpTool(client, "get_metadata", {
          fileKey,
          ...MCP_CLIENT_ARGS,
        });
        const body = toolResultText(raw);
        if (!body.trim()) continue;

        candidates.push({
          sourceType: "figma",
          sourceExternalId: `${fileKey}:structure`,
          title: `Figma file ${fileKey}`,
          sourceDate: new Date().toISOString(),
          url: figmaDesignUrl(fileKey),
          body,
          metadata: {
            transport: "mcp",
            fileKey,
            importedFrom: "figma",
          },
        });
      } catch {
        // Skip files the account cannot read.
      }
    }

    return candidates;
  });
}

export async function fetchFigmaFrameEvidenceViaMcp(input: {
  fileKey: string;
  nodeId: string;
  frameUrl: string;
}): Promise<FigmaFrameEvidence> {
  return withMcpClient("figma", APP_ORIGIN, async (client) => {
    const toolArgs = {
      fileKey: input.fileKey,
      nodeId: input.nodeId,
      ...MCP_CLIENT_ARGS,
    };

    const [metadataResult, designResult, screenshotResult] = await Promise.allSettled([
      callMcpTool(client, "get_metadata", toolArgs),
      callMcpTool(client, "get_design_context", {
        ...toolArgs,
        excludeScreenshot: true,
      }),
      callMcpTool(client, "get_screenshot", {
        ...toolArgs,
        maxDimension: 1536,
      }),
    ]);

    const metadata =
      metadataResult.status === "fulfilled" ? toolResultText(metadataResult.value) : "";
    const designContext =
      designResult.status === "fulfilled" ? toolResultText(designResult.value) : "";
    const screenshotNote =
      screenshotResult.status === "fulfilled" ? toolResultText(screenshotResult.value) : null;
    const screenshotUrl =
      screenshotResult.status === "fulfilled"
        ? toolResultImageDataUrl(screenshotResult.value)
        : null;

    if (!metadata.trim() && !designContext.trim()) {
      const reason =
        designResult.status === "rejected"
          ? designResult.reason instanceof Error
            ? designResult.reason.message
            : "Could not read the Figma frame."
          : "Figma returned no readable frame context.";
      throw new Error(reason);
    }

    return {
      fileKey: input.fileKey,
      nodeId: input.nodeId,
      frameUrl: input.frameUrl,
      metadata,
      designContext,
      screenshotNote,
      screenshotUrl,
    };
  });
}
