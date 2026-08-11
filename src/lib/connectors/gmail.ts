import "server-only";
import { bearerFetch } from "./auth";
import type { ConnectorSourceCandidate } from "./types";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";

export const DEFAULT_GMAIL_MEET_QUERY =
  '("Gemini" OR "Google Meet" OR "meeting notes" OR "transcript" OR "Take notes for me")';

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
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

export interface GoogleDocumentReference {
  id: string;
  url: string;
}

/**
 * Gemini sometimes sends only a "Document shared with you" email. The useful
 * transcript lives behind the Google Docs link, so the Gmail connector must
 * recognize both the regular and `/u/<account>/` URL shapes.
 */
export function extractGoogleDocumentReference(
  text: string
): GoogleDocumentReference | null {
  const match = text.match(
    /https?:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-z0-9_-]+)/i
  );
  if (!match) return null;
  return {
    id: match[1],
    url: `https://docs.google.com/document/d/${match[1]}/edit`,
  };
}

export function sharedGoogleDocumentTitle(subject: string): string | null {
  const match = subject.match(
    /^Document shared with you:\s*["“](.+?)["”]\s*$/i
  );
  return match?.[1]?.trim() || null;
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

type LinkedDocumentFetch = (url: string) => Promise<Response>;

/**
 * Uses the authenticated Docs export endpoint rather than Drive API v3. This
 * works with the existing read-only Google grant even when Drive API is not
 * enabled in the app's Google Cloud project.
 */
export async function fetchLinkedGoogleDocumentText(
  reference: GoogleDocumentReference,
  fetchDocument: LinkedDocumentFetch = (url) => bearerFetch("drive", url)
): Promise<string> {
  const exportUrl = new URL(
    `https://docs.google.com/document/d/${encodeURIComponent(reference.id)}/export`
  );
  exportUrl.searchParams.set("format", "txt");
  const response = await fetchDocument(exportUrl.toString());
  if (!response.ok) {
    const detail = (await response.text()).trim().replace(/\s+/g, " ");
    throw new Error(
      detail
        ? `Could not read linked Gemini document: ${detail.slice(0, 240)}`
        : `Could not read linked Gemini document (${response.status}).`
    );
  }
  const text = (await response.text()).replace(/^\uFEFF/, "").trim();
  if (!text) {
    throw new Error("Linked Gemini document was empty.");
  }
  return text;
}

async function fetchMessageCandidate(
  item: { id: string; threadId: string },
  query: string,
  skipLinkedDocuments: boolean
): Promise<ConnectorSourceCandidate | null> {
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
  const rawBody = findBody(message.payload) ?? message.snippet ?? "";
  const linkedDocument =
    extractGoogleDocumentReference(rawBody) ??
    extractGoogleDocumentReference(body);
  if (linkedDocument && skipLinkedDocuments) {
    // The dedicated Drive connector imports the document itself. Keeping the
    // Gmail share-notification as a second source would duplicate the same
    // transcript and could create duplicate tasks.
    return null;
  }
  const linkedDocumentText = linkedDocument
    ? await fetchLinkedGoogleDocumentText(linkedDocument)
    : null;
  const linkedDocumentTitle = linkedDocument
    ? sharedGoogleDocumentTitle(subject)
    : null;

  return {
    sourceType: "gmail",
    sourceExternalId: message.id,
    title: linkedDocumentTitle ?? subject,
    body: linkedDocumentText
      ? [
          `From: ${from ?? "unknown"}`,
          `Thread: ${message.threadId}`,
          `Gemini document: ${linkedDocumentTitle ?? subject}`,
          `URL: ${linkedDocument?.url}`,
          "",
          linkedDocumentText,
        ].join("\n")
      : [`From: ${from ?? "unknown"}`, `Thread: ${message.threadId}`, "", body].join("\n"),
    author: from,
    sourceDate,
    url:
      linkedDocument?.url ??
      `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
    metadata: {
      threadId: message.threadId,
      query,
      importedFrom: "gmail_gemini_meet_notes",
      ...(linkedDocument
        ? {
            linkedDocumentId: linkedDocument.id,
            linkedDocumentUrl: linkedDocument.url,
            linkedDocumentTitle: linkedDocumentTitle,
            contentOrigin: "google_docs",
          }
        : {}),
    },
  };
}

export async function fetchGeminiMeetNotes(input?: {
  query?: string;
  maxResults?: number;
  shouldCancel?: ShouldCancelSync;
  skipLinkedDocuments?: boolean;
}): Promise<ConnectorSourceCandidate[]> {
  const query = input?.query?.trim() || DEFAULT_GMAIL_MEET_QUERY;
  const messages: { id: string; threadId: string }[] = [];
  let pageToken: string | null = null;

  do {
    if (input?.shouldCancel && (await input.shouldCancel())) break;

    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("q", query);
    listUrl.searchParams.set("maxResults", String(Math.min(100, input?.maxResults ?? 100)));
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

    const listResponse = await bearerFetch("gmail", listUrl.toString());
    const listBody = (await listResponse.json()) as GmailListResponse & {
      error?: { message?: string };
    };
    if (!listResponse.ok) {
      throw new Error(listBody.error?.message ?? "Gmail search failed.");
    }

    messages.push(...(listBody.messages ?? []));
    pageToken = listBody.nextPageToken ?? null;
  } while (pageToken && (input?.maxResults == null || messages.length < input.maxResults));

  const selectedMessages = input?.maxResults
    ? messages.slice(0, input.maxResults)
    : messages;
  const candidates: ConnectorSourceCandidate[] = [];

  for (let offset = 0; offset < selectedMessages.length; offset += 10) {
    if (input?.shouldCancel && (await input.shouldCancel())) break;
    const batch = selectedMessages.slice(offset, offset + 10);
    const fetched = await Promise.all(
      batch.map((item) =>
        fetchMessageCandidate(item, query, input?.skipLinkedDocuments === true)
      )
    );
    candidates.push(
      ...fetched.filter((candidate): candidate is ConnectorSourceCandidate => candidate != null)
    );
  }

  return candidates;
}
