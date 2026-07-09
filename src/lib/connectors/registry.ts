import "server-only";
import { fetchConfluencePages } from "./confluence";
import { fetchDiscordMentions } from "./discord";
import { fetchGeminiMeetNotes } from "./gmail";
import { fetchGitHubPrSignals, githubRepositoriesForSync } from "./github";
import { fetchGranolaNotes } from "./granola";
import { fetchAssignedJiraIssues } from "./jira";
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

// Note: the local-git connector (`./localGit`) is intentionally not in this
// registry — it doesn't produce importable source items on sync; it provides
// read-only evidence to delivery verification and end-of-day memory instead.

export interface ConnectorSyncContext {
  projects: Project[];
  /** Per-provider options forwarded from the request body (e.g. a Gmail query). */
  options: Record<string, unknown>;
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
  listItems: ({ options }) =>
    fetchGeminiMeetNotes({
      query: typeof options.query === "string" ? options.query : undefined,
    }),
};

const jiraConnector: Connector = {
  provider: "jira",
  configError: () => null,
  listItems: async ({ projects }) => {
    const connection = await getConnectionByProvider("jira");
    const projectJiraKeys = unique(projects.flatMap((project) => project.jiraKeys));
    if (projectJiraKeys.length === 0) return [];
    if (isMcpTransport(connection)) {
      return fetchJiraIssuesViaMcp({ projectJiraKeys });
    }
    return fetchAssignedJiraIssues({ projectJiraKeys });
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
  listItems: async () => {
    const connection = await getConnectionByProvider("granola");
    if (isMcpTransport(connection)) {
      return fetchGranolaMeetingsViaMcp();
    }
    return fetchGranolaNotes();
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
  configError: ({ projects }) =>
    unique(projects.flatMap((project) => project.figmaFileKeys)).length === 0
      ? "Add Figma file keys in Project settings before syncing."
      : null,
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
  jira: jiraConnector,
  confluence: confluenceConnector,
  granola: granolaConnector,
  github: githubConnector,
  discord: discordConnector,
  figma: figmaConnector,
};
