import "server-only";
import { bearerFetch } from "./auth";
import type { ConnectorSourceCandidate } from "./types";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";

/** Gemini / Meet notes commonly land in Drive as Google Docs with these names. */
export const DEFAULT_DRIVE_GEMINI_QUERY =
  "trashed = false and mimeType = 'application/vnd.google-apps.document' and (" +
  "name contains 'Notes by Gemini' or name contains 'Gemini Notes' or " +
  "name contains 'Meeting Notes' or name contains 'Google Meet'" +
  ")";

interface DriveFileListResponse {
  files?: {
    id: string;
    name: string;
    modifiedTime?: string;
    createdTime?: string;
    webViewLink?: string;
    owners?: { displayName?: string; emailAddress?: string }[];
  }[];
  nextPageToken?: string;
  error?: { message?: string };
}

export async function fetchGeminiDriveNotes(input?: {
  query?: string;
  maxResults?: number;
  modifiedAfterIso?: string;
  shouldCancel?: ShouldCancelSync;
}): Promise<ConnectorSourceCandidate[]> {
  const queryParts = [input?.query?.trim() || DEFAULT_DRIVE_GEMINI_QUERY];
  if (input?.modifiedAfterIso) {
    queryParts.push(`modifiedTime > '${input.modifiedAfterIso}'`);
  }
  const query = queryParts.join(" and ");
  const maxResults = input?.maxResults ?? 40;
  const files: NonNullable<DriveFileListResponse["files"]> = [];
  let pageToken: string | null = null;

  do {
    if (input?.shouldCancel && (await input.shouldCancel())) break;

    const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
    listUrl.searchParams.set("q", query);
    listUrl.searchParams.set("pageSize", String(Math.min(100, maxResults - files.length)));
    listUrl.searchParams.set(
      "fields",
      "nextPageToken,files(id,name,modifiedTime,createdTime,webViewLink,owners)"
    );
    listUrl.searchParams.set("orderBy", "modifiedTime desc");
    listUrl.searchParams.set("spaces", "drive");
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

    const listResponse = await bearerFetch("drive", listUrl.toString());
    const listBody = (await listResponse.json()) as DriveFileListResponse;
    if (!listResponse.ok) {
      throw new Error(listBody.error?.message ?? "Google Drive search failed.");
    }

    files.push(...(listBody.files ?? []));
    pageToken = listBody.nextPageToken ?? null;
  } while (pageToken && files.length < maxResults);

  const selected = files.slice(0, maxResults);
  const candidates: ConnectorSourceCandidate[] = [];

  for (let offset = 0; offset < selected.length; offset += 5) {
    if (input?.shouldCancel && (await input.shouldCancel())) break;
    const batch = selected.slice(offset, offset + 5);
    const exported = await Promise.all(
      batch.map(async (file) => {
        const exportUrl = new URL(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export`
        );
        exportUrl.searchParams.set("mimeType", "text/plain");
        const response = await bearerFetch("drive", exportUrl.toString());
        if (!response.ok) {
          const err = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(
            err?.error?.message ?? `Could not export Drive doc ${file.id}.`
          );
        }
        const body = await response.text();
        const owner = file.owners?.[0];
        const sourceDate =
          file.modifiedTime ?? file.createdTime ?? new Date().toISOString();
        return {
          sourceType: "drive" as const,
          sourceExternalId: file.id,
          title: file.name,
          body: [
            `Drive file: ${file.name}`,
            `URL: ${file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`}`,
            owner?.displayName ? `Owner: ${owner.displayName}` : null,
            "",
            body.trim() || "(empty document)",
          ]
            .filter(Boolean)
            .join("\n"),
          author: owner?.displayName ?? owner?.emailAddress ?? null,
          sourceDate,
          url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
          metadata: {
            importedFrom: "drive_gemini_notes",
            mimeType: "application/vnd.google-apps.document",
            modifiedTime: file.modifiedTime ?? null,
          },
        } satisfies ConnectorSourceCandidate;
      })
    );
    candidates.push(...exported);
  }

  return candidates;
}
