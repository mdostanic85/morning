import "server-only";
import { getConnectionSecret } from "@/services/connectionSecrets";
import type { ConnectorSourceCandidate } from "./types";
import { fetchWithTimeout } from "@/lib/http";

interface DiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  timestamp: string;
  author?: { id: string; username: string; global_name?: string | null };
  mentions?: { id: string; username: string }[];
  referenced_message?: DiscordMessage | null;
}

async function getBotToken(): Promise<string> {
  const secret = await getConnectionSecret("discord");
  if (!secret?.botToken) throw new Error("Discord bot token is not configured.");
  return secret.botToken;
}

async function discordFetch<T>(path: string): Promise<T> {
  const token = await getBotToken();
  const response = await fetchWithTimeout(`https://discord.com/api/v10${path}`, {
    headers: {
      Authorization: `Bot ${token}`,
      Accept: "application/json",
    },
  });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Discord request failed for ${path}.`);
  return body;
}

function matchesKeywords(content: string, keywords: string[]): boolean {
  const lower = content.toLowerCase();
  return keywords.some((keyword) => keyword.trim() && lower.includes(keyword.trim().toLowerCase()));
}

export async function testDiscordConnection(): Promise<boolean> {
  await discordFetch<unknown>("/users/@me");
  return true;
}

export async function fetchDiscordMentions(input: {
  channelIds: string[];
  myUserId?: string | null;
  keywords?: string[];
  limit?: number;
}): Promise<ConnectorSourceCandidate[]> {
  const candidates: ConnectorSourceCandidate[] = [];
  const keywords = input.keywords ?? [];

  for (const channelId of input.channelIds.map((id) => id.trim()).filter(Boolean)) {
    const messages = await discordFetch<DiscordMessage[]>(
      `/channels/${channelId}/messages?limit=${input.limit ?? 50}`
    );

    const relevant = messages.filter((message) => {
      if (input.myUserId && (message.mentions ?? []).some((mention) => mention.id === input.myUserId)) {
        return true;
      }
      return matchesKeywords(message.content, keywords);
    });

    for (const message of relevant) {
      candidates.push({
        sourceType: "discord",
        sourceExternalId: message.id,
        title: `Discord: ${message.author?.global_name ?? message.author?.username ?? "message"}`,
        author: message.author?.username ?? null,
        sourceDate: message.timestamp,
        body: [
          `Channel: ${channelId}`,
          `Author: ${message.author?.username ?? "unknown"}`,
          `Mentions me: ${
            input.myUserId && (message.mentions ?? []).some((mention) => mention.id === input.myUserId)
              ? "yes"
              : "no"
          }`,
          "",
          message.content,
          message.referenced_message?.content
            ? `\nReferenced message:\n${message.referenced_message.content}`
            : null,
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
        metadata: {
          channelId,
          authorId: message.author?.id ?? null,
          mentionIds: (message.mentions ?? []).map((mention) => mention.id),
        },
      });
    }
  }

  return candidates;
}
