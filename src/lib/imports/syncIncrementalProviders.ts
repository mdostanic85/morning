import "server-only";

import type { ConnectorSyncContext } from "@/lib/connectors/registry";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";
import { fetchConfluencePageIfUpdated, fetchConfluenceSpacePages } from "@/lib/connectors/confluence";
import { fetchGitHubPrSignalsForRepo } from "@/lib/connectors/github";
import { fetchFigmaFileIfUpdated, fetchFigmaCommentsForFile } from "@/lib/connectors/figma";
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
  commitFigmaCommentsCursorOnSuccess,
  figmaFileCursorKey,
  loadFigmaFileSinceIso,
  loadFigmaCommentsSinceIso,
} from "@/lib/imports/figmaConnectionCursor";
import {
  commitDiscordChannelCursorOnSuccess,
  loadDiscordChannelAfterSnowflake,
} from "@/lib/imports/discordConnectionCursor";
import { syncResourceScopes } from "@/lib/imports/syncResourceScopes";
import { discoverFigmaFileKeys } from "@/lib/figma/discoverFigmaFileKeys";
import { getSourceItemsForProjectIds } from "@/services/sourceItems";
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
  // Discover file keys from both project settings and source-linked URLs.
  const projectIds = context.projects.map((p) => p.id);
  const linkedSources =
    projectIds.length > 0 ? await getSourceItemsForProjectIds(projectIds) : [];
  const discovery = discoverFigmaFileKeys({
    projects: context.projects,
    sourceItems: linkedSources,
  });
  const { fileKeys, projectIdByFileKey } = discovery;

  const syncedAt = () => new Date().toISOString();

  // Build two scopes per file key: one for the file structure, one for comments.
  const scopes = fileKeys.flatMap((fileKey) => {
    const projectId = projectIdByFileKey.get(fileKey) ?? null;
    return [
      {
        label: `file:${fileKey}`,
        fetch: async () => {
          const sinceIso = await loadFigmaFileSinceIso(connectionId, fileKey);
          return fetchFigmaFileIfUpdated({ fileKey, updatedSinceIso: sinceIso });
        },
        commit: async (candidates: Parameters<typeof commitFigmaFileCursorOnSuccess>[0]["candidates"]) => {
          await commitFigmaFileCursorOnSuccess({
            connectionId,
            fileKey,
            candidates,
            syncedAt: syncedAt(),
          });
        },
      },
      {
        label: `comments:${fileKey}`,
        fetch: async () => {
          const sinceIso = await loadFigmaCommentsSinceIso(connectionId, fileKey);
          return fetchFigmaCommentsForFile({ fileKey, projectId, sinceIso });
        },
        commit: async (candidates: Parameters<typeof commitFigmaCommentsCursorOnSuccess>[0]["candidates"]) => {
          await commitFigmaCommentsCursorOnSuccess({
            connectionId,
            fileKey,
            candidates,
            syncedAt: syncedAt(),
          });
        },
      },
    ];
  });

  return syncResourceScopes({ provider: "figma", shouldCancel, scopes });
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
