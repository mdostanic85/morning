import "server-only";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";
import { callMcpTool, withMcpClient } from "../client";
import { asRecord } from "../parse";

const APP_ORIGIN = process.env.MORNING_APP_URL?.trim() || "http://localhost:3000";
const MAX_MEETINGS_PER_SYNC = 20;
const GET_MEETINGS_BATCH = 10;

/**
 * Granola MCP adapter. The hosted server (mcp.granola.ai) returns meeting
 * data as XML-ish text blocks rather than JSON, e.g.:
 *   <meeting id="..." title="Team sync" date="Feb 4, 2026 7:30 PM">
 *     <known_participants>...</known_participants>
 *     <summary>...</summary>
 *   </meeting>
 * so we extract fields with tolerant regex parsing.
 */

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
  return raw == null ? "" : JSON.stringify(raw);
}

interface GranolaMeetingBlock {
  id: string;
  title: string;
  date: string | null;
  participants: string[];
  content: string;
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1] ?? null;
}

function innerTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match?.[1]?.trim() ?? null;
}

function parseMeetingBlocks(text: string): GranolaMeetingBlock[] {
  const blocks: GranolaMeetingBlock[] = [];
  const meetingRegex = /<meeting\b([^>]*)(?:\/>|>([\s\S]*?)<\/meeting>)/g;
  let match: RegExpExecArray | null;
  while ((match = meetingRegex.exec(text)) !== null) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const id = attribute(attrs, "id");
    if (!id) continue;
    const participantsRaw = innerTag(inner, "known_participants") ?? "";
    const participants = participantsRaw
      .split("\n")
      .map((line) => line.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean);
    blocks.push({
      id,
      title: attribute(attrs, "title") ?? "Granola meeting",
      date: attribute(attrs, "date"),
      participants,
      content: (innerTag(inner, "summary") ?? inner).trim(),
    });
  }
  return blocks;
}

function parseMeetingDate(value: string | null): string {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function meetingToCandidate(meeting: GranolaMeetingBlock): ConnectorSourceCandidate {
  return {
    sourceType: "granola",
    sourceExternalId: meeting.id,
    title: meeting.title,
    sourceDate: parseMeetingDate(meeting.date),
    url: null,
    body: [
      meeting.participants.length
        ? `Participants: ${meeting.participants.join(", ")}`
        : null,
      meeting.date ? `Meeting date: ${meeting.date}` : null,
      "",
      "Meeting notes:",
      meeting.content || "(no notes)",
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
    metadata: {
      participants: meeting.participants,
      importedFrom: "granola",
      transport: "mcp",
    },
  };
}

export async function fetchGranolaMeetingsViaMcp(): Promise<ConnectorSourceCandidate[]> {
  return withMcpClient("granola", APP_ORIGIN, async (client) => {
    const meetings = await listRecentMeetings(client);
    if (meetings.length === 0) return [];

    const candidates: ConnectorSourceCandidate[] = [];
    const ids = meetings.slice(0, MAX_MEETINGS_PER_SYNC).map((meeting) => meeting.id);

    for (let i = 0; i < ids.length; i += GET_MEETINGS_BATCH) {
      const batch = ids.slice(i, i + GET_MEETINGS_BATCH);
      const raw = await callMcpTool(client, "get_meetings", { meeting_ids: batch });
      const detailed = parseMeetingBlocks(toolResultText(raw));
      const detailedById = new Map(detailed.map((meeting) => [meeting.id, meeting]));

      for (const id of batch) {
        const listed = meetings.find((meeting) => meeting.id === id);
        const meeting = detailedById.get(id) ?? listed;
        if (!meeting) continue;
        // Prefer detailed content but keep the listing's title/date when the
        // detail response omits them.
        candidates.push(
          meetingToCandidate({
            ...meeting,
            title: meeting.title !== "Granola meeting" ? meeting.title : listed?.title ?? meeting.title,
            date: meeting.date ?? listed?.date ?? null,
          })
        );
      }
    }

    return candidates;
  });
}

async function listRecentMeetings(client: Client): Promise<GranolaMeetingBlock[]> {
  const raw = await callMcpTool(client, "list_meetings", {
    time_range: "last_30_days",
  });
  return parseMeetingBlocks(toolResultText(raw));
}
