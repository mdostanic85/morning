import "server-only";
import { bearerFetch } from "./auth";
import type { ConnectorSourceCandidate } from "./types";

export const DEFAULT_GMAIL_MEET_QUERY =
  '("Gemini" OR "Google Meet" OR "meeting notes" OR "transcript" OR "Take notes for me") newer_than:30d';

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  payload?: {
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: GmailMessage["payload"][];
  };
  snippet?: string;
  internalDate?: string;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function header(message: GmailMessage, name: string): string | null {
  const found = message.payload?.headers?.find(
    (candidate) => candidate.name.toLowerCase() === name.toLowerCase()
  );
  return found?.value ?? null;
}

function findBody(part: GmailMessage["payload"] | undefined): string | null {
  if (!part) return null;
  if (part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const text = findBody(child);
    if (text) return text;
  }
  return null;
}

function buildEmailBody(message: GmailMessage): string {
  const body = findBody(message.payload);
  if (body) return body.includes("<") && body.includes(">") ? stripHtml(body) : body;
  return message.snippet ?? "";
}

export async function fetchGeminiMeetNotes(input?: {
  query?: string;
  maxResults?: number;
}): Promise<ConnectorSourceCandidate[]> {
  const query = input?.query?.trim() || DEFAULT_GMAIL_MEET_QUERY;
  const maxResults = input?.maxResults ?? 25;
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("maxResults", String(maxResults));

  const listResponse = await bearerFetch("gmail", listUrl.toString());
  const listBody = (await listResponse.json()) as GmailListResponse & { error?: { message?: string } };
  if (!listResponse.ok) {
    throw new Error(listBody.error?.message ?? "Gmail search failed.");
  }

  const messages = listBody.messages ?? [];
  const candidates: ConnectorSourceCandidate[] = [];

  for (const item of messages) {
    const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}`);
    messageUrl.searchParams.set("format", "full");
    const response = await bearerFetch("gmail", messageUrl.toString());
    const message = (await response.json()) as GmailMessage & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(message.error?.message ?? `Could not read Gmail message ${item.id}.`);
    }

    const subject = header(message, "Subject") ?? "Gmail note";
    const from = header(message, "From");
    const dateHeader = header(message, "Date");
    const sourceDate = message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : dateHeader
        ? new Date(dateHeader).toISOString()
        : new Date().toISOString();
    const body = buildEmailBody(message);

    candidates.push({
      sourceType: "gmail",
      sourceExternalId: message.id,
      title: subject,
      body: [`From: ${from ?? "unknown"}`, `Thread: ${message.threadId}`, "", body].join("\n"),
      author: from,
      sourceDate,
      url: `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
      metadata: {
        threadId: message.threadId,
        query,
        importedFrom: "gmail_gemini_meet_notes",
      },
    });
  }

  return candidates;
}
