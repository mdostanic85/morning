import "server-only";
import { fetchConfluencePages } from "./confluence";
import { fetchDiscordMentions } from "./discord";
import { DEFAULT_GMAIL_MEET_QUERY, fetchGeminiMeetNotes } from "./gmail";
import { DEFAULT_DRIVE_GEMINI_QUERY, fetchGeminiDriveNotes } from "./drive";
import { loadCalendarSyncToken } from "@/lib/imports/calendarConnectionCursor";
import { setPendingCalendarSync } from "@/lib/imports/calendarSyncState";
import { fetchCalendarEventsIncremental } from "./calendar";
import { clearCalendarSyncToken } from "@/lib/imports/calendarConnectionCursor";
import { fetchGitHubPrSignals, githubRepositoriesForSync } from "./github";
import { fetchGranolaNotes } from "./granola";
import { buildAssigneeJiraJql, buildMentionedJiraJql, fetchAssignedJiraIssues } from "./jira";
import { loadDriveIncrementalSinceIso } from "@/lib/imports/driveConnectionCursor";
import {
  fetchConfluencePagesViaMcp,
  fetchJiraIssuesViaMcp,
} from "./mcp/adapters/atlassian";
import { fetchGranolaMeetingsViaMcp } from "./mcp/adapters/granola";
import { fetchFigmaFilesViaApi } from "./figma";
import { fetchFigmaFilesViaMcp } from "./mcp/adapters/figma";
import type { ConnectionProvider } from "./providers";
import { isMcpTransport } from "./transport";
import type { ConnectorSourceCandidate } from "./types";
import type { Project } from "@/domain/project";
import { getConnectionByProvider } from "@/services/connections";
import { getUserProfile } from "@/services/userProfile";
import { loadGranolaIncrementalSinceIso } from "@/lib/imports/granolaConnectionCursor";
import { loadGmailIncrementalAfterDate } from "@/lib/imports/gmailConnectionCursor";
import { loadJiraIncrementalWindow } from "@/lib/imports/jiraConnectionCursor";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";

// Note: the local-git connector (`./localGit`) is intentionally not in this
// registry — it doesn't produce importable source items on sync; it provides
// read-only evidence to delivery verification and end-of-day memory instead.

export interface ConnectorSyncContext {
  projects: Project[];
  /** Per-provider options forwarded from the request body (e.g. a Gmail query). */
  options: Record<string, unknown>;
  shouldCancel?: ShouldCancelSync;
}

/**
 * The shared interface every syncable connector implements. All reads, no
 * writes: `listItems` fetches new external signals as source candidates.
 */
export interface Connector {
  provider: ConnectionProvider;
  /** Returns a user-facing message when required configuration is missing, or null when ready to sync. */
  configError(context: ConnectorSyncContext): string | null | Promise<string | null>;
  listItems(context: ConnectorSyncContext): Promise<ConnectorSourceCandidate[]>;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stringsFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

const gmailConnector: Connector = {
  provider: "gmail",
  configError: () => null,
  listItems: async ({ options, shouldCancel }) => {
    const connection = await getConnectionByProvider("gmail");
    const baseQuery =
      typeof options.query === "string" && options.query.trim()
        ? options.query.trim()
        : DEFAULT_GMAIL_MEET_QUERY;
    const afterDate = connection
      ? (await loadGmailIncrementalAfterDate(connection.id)).afterDate
      : null;
    const timeFilter = afterDate ? `after:${afterDate}` : "newer_than:30d";

    return fetchGeminiMeetNotes({
      query: `${baseQuery} ${timeFilter}`,
      maxResults: 50,
      shouldCancel,
    });
  },
};

const calendarConnector: Connector = {
  provider: "calendar",
  configError: () => null,
  listItems: async ({ shouldCancel }) => {
    const connection = await getConnectionByProvider("calendar");
    let syncToken = connection ? await loadCalendarSyncToken(connection.id) : null;
    let result = await fetchCalendarEventsIncremental({ syncToken, shouldCancel });
    if (result.syncTokenExpired && connection) {
      await clearCalendarSyncToken(connection.id);
      syncToken = null;
      result = await fetchCalendarEventsIncremental({ shouldCancel });
    }
    setPendingCalendarSync({
      nextSyncToken: result.nextSyncToken,
      syncTokenExpired: result.syncTokenExpired,
    });
    return result.candidates;
  },
};

const driveConnector: Connector = {
  provider: "drive",
  configError: () => null,
  listItems: async ({ options, shouldCancel }) => {
    const connection = await getConnectionByProvider("drive");
    const query =
      typeof options.query === "string" && options.query.trim()
        ? options.query.trim()
        : DEFAULT_DRIVE_GEMINI_QUERY;
    const modifiedAfterIso = connection
      ? (await loadDriveIncrementalSinceIso(connection.id)).modifiedAfterIso
      : undefined;
    return fetchGeminiDriveNotes({
      query,
      modifiedAfterIso,
      maxResults: 40,
      shouldCancel,
    });
  },
};

const jiraConnector: Connector = {
  provider: "jira",
  configError: () => null,
  listItems: async ({ projects, shouldCancel }) => {
    const connection = await getConnectionByProvider("jira");
    const projectJiraKeys = unique(projects.flatMap((project) => project.jiraKeys));
    const profile = await getUserProfile();
    const projectKeys = projectJiraKeys.length > 0 ? projectJiraKeys : undefined;
    const assigneeJql = buildAssigneeJiraJql();
    const mentionJql = buildMentionedJiraJql(profile?.name);

    async function fetchWithJql(jql: string): Promise<ConnectorSourceCandidate[]> {
      if (isMcpTransport(connection)) {
        return fetchJiraIssuesViaMcp({
          jql,
          projectJiraKeys: projectKeys,
          // Include Done assignees for awareness without starving open work.
          maxResults: 50,
        });
      }
      const updatedSinceIso = connection
        ? (await loadJiraIncrementalWindow(connection.id)).updatedSinceIso
        : undefined;
      return fetchAssignedJiraIssues({
        jql,
        projectJiraKeys: projectKeys,
        updatedSinceIso,
        maxResults: 50,
        shouldCancel,
      });
    }

    const assigned = await fetchWithJql(assigneeJql);
    for (const item of assigned) {
      item.metadata = { ...(item.metadata ?? {}), involvement: "assignee" };
    }

    const mentioned = mentionJql ? await fetchWithJql(mentionJql) : [];
    for (const item of mentioned) {
      item.metadata = { ...(item.metadata ?? {}), involvement: "mentioned" };
    }

    // Assignee wins when the same key appears in both pulls.
    const byKey = new Map<string, ConnectorSourceCandidate>();
    for (const item of mentioned) {
      if (item.sourceExternalId) byKey.set(item.sourceExternalId, item);
    }
    for (const item of assigned) {
      if (item.sourceExternalId) byKey.set(item.sourceExternalId, item);
    }
    return Array.from(byKey.values());
  },
};

const confluenceConnector: Connector = {
  provider: "confluence",
  configError: ({ projects, options }) => {
    const spaceKeys = stringsFrom(options.spaceKeys).length
      ? stringsFrom(options.spaceKeys)
      : projects.flatMap((project) => project.confluenceSpaces);
    const pageUrls = stringsFrom(options.pageUrls).length
      ? stringsFrom(options.pageUrls)
      : projects.flatMap((project) => project.confluencePageUrls);
    return unique(spaceKeys).length === 0 && unique(pageUrls).length === 0
      ? "Select Confluence spaces or page URLs before syncing."
      : null;
  },
  listItems: async ({ projects, options }) => {
    const connection = await getConnectionByProvider("confluence");
    const requestedSpaces = stringsFrom(options.spaceKeys);
    const requestedUrls = stringsFrom(options.pageUrls);
    const spaceKeys = unique(
      requestedSpaces.length
        ? requestedSpaces
        : projects.flatMap((project) => project.confluenceSpaces)
    );
    const pageUrls = unique(
      requestedUrls.length
        ? requestedUrls
        : projects.flatMap((project) => project.confluencePageUrls)
    );
    if (isMcpTransport(connection)) {
      return fetchConfluencePagesViaMcp({ spaceKeys, pageUrls });
    }
    return fetchConfluencePages({ spaceKeys, pageUrls });
  },
};

const granolaConnector: Connector = {
  provider: "granola",
  configError: () => null,
  listItems: async ({ shouldCancel }) => {
    const connection = await getConnectionByProvider("granola");
    if (isMcpTransport(connection)) {
      return fetchGranolaMeetingsViaMcp();
    }
    const createdAfterIso = connection
      ? (await loadGranolaIncrementalSinceIso(connection.id)).createdAfterIso
      : undefined;
    return fetchGranolaNotes({ shouldCancel, createdAfterIso });
  },
};

const githubConnector: Connector = {
  provider: "github",
  configError: async ({ projects }) => {
    const repositories = await githubRepositoriesForSync(projects);
    return repositories.length === 0
      ? "Connect GitHub in Settings and pick a repository and branch."
      : null;
  },
  listItems: async ({ projects }) =>
    fetchGitHubPrSignals({
      repositories: await githubRepositoriesForSync(projects),
    }),
};

const discordConnector: Connector = {
  provider: "discord",
  configError: ({ projects }) =>
    unique(projects.flatMap((project) => project.discordChannels)).length === 0
      ? "Add Discord channel IDs in Project settings before syncing."
      : null,
  listItems: ({ projects, options }) =>
    fetchDiscordMentions({
      channelIds: unique(projects.flatMap((project) => project.discordChannels)),
      keywords: unique(projects.flatMap((project) => project.keywords)),
      myUserId: typeof options.myUserId === "string" ? options.myUserId : null,
    }),
};

const figmaConnector: Connector = {
  provider: "figma",
  // configError is intentionally lenient: even with no project figmaFileKeys
  // configured, Sync My Day may discover keys from Jira/transcript sources.
  // We only block when there is genuinely no Figma connection at all.
  configError: async () => {
    const connection = await getConnectionByProvider("figma");
    if (!connection || connection.status !== "connected") {
      return "Connect Figma in Settings before syncing.";
    }
    return null;
  },
  listItems: async ({ projects }) => {
    const connection = await getConnectionByProvider("figma");
    if (!connection || connection.status !== "connected") return [];
    const figmaFileKeys = unique(projects.flatMap((project) => project.figmaFileKeys));
    if (isMcpTransport(connection)) {
      return fetchFigmaFilesViaMcp({ figmaFileKeys });
    }
    return fetchFigmaFilesViaApi({ figmaFileKeys });
  },
};

export const CONNECTOR_REGISTRY: Record<ConnectionProvider, Connector> = {
  gmail: gmailConnector,
  calendar: calendarConnector,
  drive: driveConnector,
  jira: jiraConnector,
  confluence: confluenceConnector,
  granola: granolaConnector,
  github: githubConnector,
  discord: discordConnector,
  figma: figmaConnector,
};
