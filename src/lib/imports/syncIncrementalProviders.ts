import "server-only";

import type { ConnectorSyncContext } from "@/lib/connectors/registry";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";
import { fetchConfluencePageIfUpdated, fetchConfluenceSpacePages } from "@/lib/connectors/confluence";
import { fetchGitHubPrSignalsForRepo } from "@/lib/connectors/github";
import { fetchFigmaFileIfUpdated } from "@/lib/connectors/figma";
import { fetchDiscordChannelMessages } from "@/lib/connectors/discord";
import { githubRepositoriesForSync } from "@/lib/connectors/github";
import {
  commitConfluenceResourceCursorOnSuccess,
  confluencePageCursorKey,
  confluenceSpaceCursorKey,
  loadConfluenceResourceSinceIso,
} from "@/lib/imports/confluenceConnectionCursor";
import {
  commitGitHubRepoCursorOnSuccess,
  githubRepoCursorKey,
  loadGitHubRepoSinceIso,
} from "@/lib/imports/githubConnectionCursor";
import {
  commitFigmaFileCursorOnSuccess,
  figmaFileCursorKey,
  loadFigmaFileSinceIso,
} from "@/lib/imports/figmaConnectionCursor";
import {
  commitDiscordChannelCursorOnSuccess,
  loadDiscordChannelAfterSnowflake,
} from "@/lib/imports/discordConnectionCursor";
import { syncResourceScopes } from "@/lib/imports/syncResourceScopes";
import type { ProviderSyncOutcome } from "@/lib/imports/syncProvider";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stringsFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function pageIdFromUrl(url: string): string | null {
  const match = url.match(/\/pages\/(\d+)/) ?? url.match(/[?&]pageId=(\d+)/);
  return match?.[1] ?? null;
}

export async function syncConfluenceIncremental(
  context: ConnectorSyncContext,
  connectionId: number,
  shouldCancel?: ShouldCancelSync
): Promise<ProviderSyncOutcome> {
  const requestedSpaces = stringsFrom(context.options.spaceKeys);
  const requestedUrls = stringsFrom(context.options.pageUrls);
  const spaceKeys = unique(
    requestedSpaces.length
      ? requestedSpaces
      : context.projects.flatMap((project) => project.confluenceSpaces)
  );
  const pageIds = unique(
    (requestedUrls.length
      ? requestedUrls
      : context.projects.flatMap((project) => project.confluencePageUrls)
    )
      .map(pageIdFromUrl)
      .filter((id): id is string => id != null)
  );

  const syncedAt = () => new Date().toISOString();
  const scopes = [
    ...pageIds.map((pageId) => ({
      label: `page:${pageId}`,
      fetch: async () => {
        const sinceIso = await loadConfluenceResourceSinceIso(
          confluencePageCursorKey(connectionId, pageId)
        );
        return fetchConfluencePageIfUpdated(pageId, sinceIso);
      },
      commit: async (candidates: Parameters<typeof commitConfluenceResourceCursorOnSuccess>[0]["candidates"]) => {
        await commitConfluenceResourceCursorOnSuccess({
          key: confluencePageCursorKey(connectionId, pageId),
          candidates,
          syncedAt: syncedAt(),
        });
      },
    })),
    ...spaceKeys.map((spaceKey) => ({
      label: `space:${spaceKey}`,
      fetch: async () => {
        const sinceIso = await loadConfluenceResourceSinceIso(
          confluenceSpaceCursorKey(connectionId, spaceKey)
        );
        return fetchConfluenceSpacePages({ spaceKey, updatedSinceIso: sinceIso });
      },
      commit: async (candidates: Parameters<typeof commitConfluenceResourceCursorOnSuccess>[0]["candidates"]) => {
        await commitConfluenceResourceCursorOnSuccess({
          key: confluenceSpaceCursorKey(connectionId, spaceKey),
          candidates,
          syncedAt: syncedAt(),
        });
      },
    })),
  ];

  return syncResourceScopes({ provider: "confluence", shouldCancel, scopes });
}

export async function syncGitHubIncremental(
  context: ConnectorSyncContext,
  connectionId: number,
  shouldCancel?: ShouldCancelSync
): Promise<ProviderSyncOutcome> {
  const repositories = await githubRepositoriesForSync(context.projects);
  const syncedAt = () => new Date().toISOString();

  return syncResourceScopes({
    provider: "github",
    shouldCancel,
    scopes: repositories.map((repository) => ({
      label: `repo:${repository}`,
      fetch: async () => {
        const sinceIso = await loadGitHubRepoSinceIso(connectionId, repository);
        return fetchGitHubPrSignalsForRepo({ repository, updatedSinceIso: sinceIso });
      },
      commit: async (candidates) => {
        await commitGitHubRepoCursorOnSuccess({
          connectionId,
          repository,
          candidates,
          syncedAt: syncedAt(),
        });
      },
    })),
  });
}

export async function syncFigmaIncremental(
  context: ConnectorSyncContext,
  connectionId: number,
  shouldCancel?: ShouldCancelSync
): Promise<ProviderSyncOutcome> {
  const figmaFileKeys = unique(context.projects.flatMap((project) => project.figmaFileKeys));
  const syncedAt = () => new Date().toISOString();

  return syncResourceScopes({
    provider: "figma",
    shouldCancel,
    scopes: figmaFileKeys.map((fileKey) => ({
      label: `file:${fileKey}`,
      fetch: async () => {
        const sinceIso = await loadFigmaFileSinceIso(connectionId, fileKey);
        return fetchFigmaFileIfUpdated({ fileKey, updatedSinceIso: sinceIso });
      },
      commit: async (candidates) => {
        await commitFigmaFileCursorOnSuccess({
          connectionId,
          fileKey,
          candidates,
          syncedAt: syncedAt(),
        });
      },
    })),
  });
}

export async function syncDiscordIncremental(
  context: ConnectorSyncContext,
  connectionId: number,
  shouldCancel?: ShouldCancelSync
): Promise<ProviderSyncOutcome> {
  const channelIds = unique(context.projects.flatMap((project) => project.discordChannels));
  const keywords = unique(context.projects.flatMap((project) => project.keywords));
  const myUserId =
    typeof context.options.myUserId === "string" ? context.options.myUserId : null;
  const syncedAt = () => new Date().toISOString();

  return syncResourceScopes({
    provider: "discord",
    shouldCancel,
    scopes: channelIds.map((channelId) => ({
      label: `channel:${channelId}`,
      fetch: async () => {
        const afterSnowflake = await loadDiscordChannelAfterSnowflake(connectionId, channelId);
        return fetchDiscordChannelMessages({
          channelId,
          keywords,
          myUserId,
          afterSnowflake,
        });
      },
      commit: async (candidates) => {
        await commitDiscordChannelCursorOnSuccess({
          connectionId,
          channelId,
          candidates,
          syncedAt: syncedAt(),
        });
      },
    })),
  });
}
