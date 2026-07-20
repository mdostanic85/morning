import "server-only";
import { getConnectionSecret } from "@/services/connectionSecrets";
import type { ConnectorSourceCandidate } from "./types";
import { fetchWithTimeout } from "@/lib/http";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";

/**
 * Granola public REST API connector (https://public-api.granola.ai/v1).
 * Read-only: lists recent notes, then fetches each note's summary and
 * transcript. Auth is a Bearer API key (grn_...) created in the Granola app.
 */

interface GranolaAttendee {
  name?: string | null;
  email?: string;
}

interface GranolaTranscriptSegment {
  speaker?: string | { source?: string } | null;
  text?: string;
}

interface GranolaNoteSummary {
  id: string;
  title?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface GranolaNote extends GranolaNoteSummary {
  web_url?: string | null;
  attendees?: GranolaAttendee[];
  summary_text?: string | null;
  summary_markdown?: string | null;
  transcript?: GranolaTranscriptSegment[];
}

interface GranolaListNotesResponse {
  notes?: GranolaNoteSummary[];
  hasMore?: boolean;
  cursor?: string | null;
  error?: string;
  message?: string;
}

const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_NOTES_PER_SYNC = 20;

function baseUrl(): string {
  return (
    process.env.GRANOLA_API_BASE_URL?.replace(/\/$/, "") ||
    "https://public-api.granola.ai/v1"
  );
}

async function getApiKey(): Promise<string> {
  const secret = await getConnectionSecret("granola");
  if (!secret?.apiKey) throw new Error("Granola API key is not configured.");
  return secret.apiKey;
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
}

export async function testGranolaConnection(): Promise<boolean> {
  const apiKey = await getApiKey();
  const response = await fetchWithTimeout(`${baseUrl()}/notes?page_size=1`, {
    headers: authHeaders(apiKey),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "Granola rejected the API key. Create one in the Granola app under Settings → API."
        : `Granola API returned ${response.status}.`
    );
  }
  return true;
}

async function listRecentNoteSummaries(
  apiKey: string,
  input?: {
    createdAfterIso?: string;
    shouldCancel?: ShouldCancelSync;
  }
): Promise<GranolaNoteSummary[]> {
  const createdAfter =
    input?.createdAfterIso ??
    new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const summaries: GranolaNoteSummary[] = [];
  let cursor: string | null = null;

  while (summaries.length < MAX_NOTES_PER_SYNC) {
    if (input?.shouldCancel && (await input.shouldCancel())) break;

    const url = new URL(`${baseUrl()}/notes`);
    url.searchParams.set("created_after", createdAfter);
    url.searchParams.set("page_size", "30");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetchWithTimeout(url.toString(), {
      headers: authHeaders(apiKey),
    });
    const body = (await response.json()) as GranolaListNotesResponse;
    if (!response.ok) {
      throw new Error(body.error ?? body.message ?? "Granola notes sync failed.");
    }

    summaries.push(...(body.notes ?? []));
    if (!body.hasMore || !body.cursor) break;
    cursor = body.cursor;
  }

  return summaries.slice(0, MAX_NOTES_PER_SYNC);
}

async function getNoteWithTranscript(
  apiKey: string,
  noteId: string
): Promise<GranolaNote | null> {
  const response = await fetchWithTimeout(
    `${baseUrl()}/notes/${encodeURIComponent(noteId)}?include=transcript`,
    { headers: authHeaders(apiKey) }
  );
  // Notes still being processed return 404 — skip them silently.
  if (response.status === 404) return null;
  const body = (await response.json()) as GranolaNote & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(body.error ?? body.message ?? `Granola note ${noteId} fetch failed.`);
  }
  return body;
}

function transcriptToText(transcript: GranolaTranscriptSegment[] | undefined): string {
  if (!transcript?.length) return "";
  return transcript
    .map((segment) => {
      const speaker =
        typeof segment.speaker === "string"
          ? segment.speaker
          : segment.speaker?.source ?? "speaker";
      return segment.text ? `${speaker}: ${segment.text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function noteToCandidate(note: GranolaNote): ConnectorSourceCandidate {
  const attendees = (note.attendees ?? [])
    .map((attendee) => attendee.name || attendee.email || "")
    .filter(Boolean);
  const summary = note.summary_markdown ?? note.summary_text ?? "";
  const transcriptText = transcriptToText(note.transcript);

  return {
    sourceType: "granola",
    sourceExternalId: note.id,
    title: note.title ?? "Granola meeting",
    sourceDate: note.updated_at ?? note.created_at ?? new Date().toISOString(),
    url: note.web_url ?? null,
    body: [
      attendees.length ? `Participants: ${attendees.join(", ")}` : null,
      note.web_url ? `URL: ${note.web_url}` : null,
      "",
      "Meeting summary:",
      summary || "(no summary)",
      transcriptText ? "" : null,
      transcriptText ? "Transcript:" : null,
      transcriptText || null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
    metadata: {
      participants: attendees,
      importedFrom: "granola",
      transport: "api",
      summary: note.summary_markdown ?? note.summary_text ?? null,
    },
  };
}

export async function fetchGranolaNotes(input?: {
  createdAfterIso?: string;
  shouldCancel?: ShouldCancelSync;
}): Promise<ConnectorSourceCandidate[]> {
  const apiKey = await getApiKey();
  const summaries = await listRecentNoteSummaries(apiKey, input);

  const candidates: ConnectorSourceCandidate[] = [];
  for (const summary of summaries) {
    const note = await getNoteWithTranscript(apiKey, summary.id);
    if (note) candidates.push(noteToCandidate(note));
  }
  return candidates;
}
