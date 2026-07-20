import { getApiKeyStatuses } from "@/services/settings";
import { ApiKeyForm } from "@/components/ApiKeyForm";
import { ProfileForm } from "@/components/ProfileForm";
import { IngestForm } from "@/components/IngestForm";
import { getConnections } from "@/services/connections";
import { getUserProfile } from "@/services/userProfile";
import { ConnectionCard } from "@/components/ConnectionCard";
import { GitHubConnectionSettings } from "@/components/GitHubConnectionSettings";
import { SettingsHubLinks } from "@/components/SettingsHubLinks";
import type { ConnectionTransport } from "@/domain/connection";
import { Tabs } from "@heroui/react/tabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [statuses, connections, profile, params] = await Promise.all([
    getApiKeyStatuses(),
    getConnections(),
    getUserProfile(),
    searchParams,
  ]);
  const connectionError =
    typeof params.connection_error === "string" ? params.connection_error : null;
  const connectedProvider = typeof params.connected === "string" ? params.connected : null;
  const connectionByProvider = new Map(connections.map((connection) => [connection.provider, connection]));

  const hasEnv = (...names: string[]) => names.every((name) => Boolean(process.env[name]?.trim()));
  const oauthSetupHint = (configured: boolean, vars: string, url: string) =>
    configured ? null : `To enable direct API Connect, add ${vars} to .env.local (create the OAuth app at ${url}), then restart the dev server. MCP Connect works without these.`;

  const connectionCards = [
    {
      provider: "gmail",
      label: "Gmail",
      description: "Read-only Gmail sync for Gemini, Google Meet, meeting notes, and transcripts.",
      authType: "oauth" as const,
      setupHint: oauthSetupHint(
        hasEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
        "console.cloud.google.com"
      ),
    },
    {
      provider: "calendar",
      label: "Google Calendar",
      description: "Read-only sync for today's meetings, attendees, times, and Meet links.",
      authType: "oauth" as const,
      setupHint: oauthSetupHint(
        hasEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
        "console.cloud.google.com"
      ),
    },
    {
      provider: "drive",
      label: "Google Drive",
      description:
        "Read-only sync for Gemini meeting notes and Google Docs transcripts saved to Drive.",
      authType: "oauth" as const,
      setupHint: oauthSetupHint(
        hasEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
        "console.cloud.google.com"
      ),
    },
    {
      provider: "jira",
      label: "Jira",
      description: "Read-only sync for assigned, non-done issues. Connect via MCP (recommended) or direct API.",
      authType: "oauth" as const,
      supportsMcp: true,
      mcpConnectUrl: "/api/mcp/atlassian/connect",
      setupHint: oauthSetupHint(
        hasEnv("ATLASSIAN_CLIENT_ID", "ATLASSIAN_CLIENT_SECRET"),
        "ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET",
        "developer.atlassian.com/console/myapps"
      ),
    },
    {
      provider: "confluence",
      label: "Confluence",
      description: "Read-only sync for selected spaces and page URLs. Shares Atlassian MCP with Jira.",
      authType: "oauth" as const,
      supportsMcp: true,
      mcpConnectUrl: "/api/mcp/atlassian/connect",
      setupHint: oauthSetupHint(
        hasEnv("ATLASSIAN_CLIENT_ID", "ATLASSIAN_CLIENT_SECRET"),
        "ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET",
        "developer.atlassian.com/console/myapps"
      ),
    },
    {
      provider: "granola",
      label: "Granola",
      description:
        "Read-only sync for meeting notes and transcripts. Connect via MCP (recommended, browser sign-in) or paste a grn_ API key from the Granola app.",
      authType: "api_key" as const,
      supportsMcp: true,
      mcpConnectUrl: "/api/mcp/granola/connect",
    },
    {
      provider: "github",
      label: "GitHub",
      description:
        "Read-only sync for your repositories — PRs, comments, and checks. Sign in, then pick repo and branch here.",
      authType: "oauth" as const,
      patFallback: true,
      setupHint: oauthSetupHint(
        hasEnv("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"),
        "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET",
        "github.com/settings/developers"
      ),
    },
    {
      provider: "figma",
      label: "Figma",
      description:
        "Read-only design sync and frame context for delivery verification. Paste a personal access token from Figma → Settings → Security.",
      authType: "pat" as const,
      supportsMcp: hasEnv("FIGMA_MCP_CLIENT_ID", "FIGMA_MCP_CLIENT_SECRET"),
      mcpConnectUrl: hasEnv("FIGMA_MCP_CLIENT_ID", "FIGMA_MCP_CLIENT_SECRET")
        ? "/api/mcp/figma/connect"
        : null,
      setupHint: hasEnv("FIGMA_MCP_CLIENT_ID", "FIGMA_MCP_CLIENT_SECRET")
        ? null
        : "Remote MCP OAuth is limited to Figma's approved client list. Use a read-only personal access token instead. Optional: join figma.com/mcp-catalog and add FIGMA_MCP_CLIENT_ID + FIGMA_MCP_CLIENT_SECRET to .env.local to enable MCP Connect.",
    },
    {
      provider: "discord",
      label: "Discord",
      description: "Read-only bot sync for selected channel mentions and keyword matches.",
      authType: "bot" as const,
    },
  ] as {
    provider: string;
    label: string;
    description: string;
    authType: "oauth" | "api_key" | "pat" | "bot" | "mcp";
    setupHint?: string | null;
    supportsMcp?: boolean;
    mcpConnectUrl?: string | null;
    patFallback?: boolean;
  }[];

  const connectedCount = connections.filter((c) => c.status === "connected").length;
  const activeKeyCount = statuses.filter((s) => s.configured && s.enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Connect sources, model keys, and automation. Today stays the daily screen — everything
          here is setup. Raw secrets never go to the browser.
        </p>
      </div>

      {connectionError ? (
        <div className="rounded-surface border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span className="font-medium">Connection failed: </span>
          {connectionError}
        </div>
      ) : null}

      {connectedProvider ? (
        <div className="rounded-surface border border-good/35 bg-good/10 px-4 py-3 text-sm text-good">
          <span className="font-medium capitalize">{connectedProvider}</span> connected successfully.
        </div>
      ) : null}

      <Tabs defaultSelectedKey="connections" className="flex flex-col gap-5">
        <Tabs.ListContainer className="w-fit max-w-full rounded-xl border border-border bg-background p-1">
          <Tabs.List
            aria-label="Settings sections"
            className="flex w-fit max-w-full items-center gap-1"
          >
            <Tabs.Tab
              id="connections"
              className="relative min-h-9 flex-1 rounded-lg px-4 text-[13.5px] font-medium whitespace-nowrap text-muted hover:text-foreground selected:text-foreground"
            >
              Connections
              <span className="ml-0.5 inline-flex items-center rounded-full bg-foreground/8 px-1.5 py-0.5 text-xs leading-none text-muted-soft">
                {connectedCount}/{connectionCards.length}
              </span>
              <Tabs.Indicator className="bg-surface-raised shadow-sm ring-1 ring-border-strong" />
            </Tabs.Tab>
            <Tabs.Tab
              id="transcript"
              className="relative min-h-9 flex-1 rounded-lg px-4 text-[13.5px] font-medium whitespace-nowrap text-muted hover:text-foreground selected:text-foreground"
            >
              Manual transcript
              <Tabs.Indicator className="bg-surface-raised shadow-sm ring-1 ring-border-strong" />
            </Tabs.Tab>
            <Tabs.Tab
              id="model-keys"
              className="relative min-h-9 flex-1 rounded-lg px-4 text-[13.5px] font-medium whitespace-nowrap text-muted hover:text-foreground selected:text-foreground"
            >
              Model keys
              <span className="ml-0.5 inline-flex items-center rounded-full bg-foreground/8 px-1.5 py-0.5 text-xs leading-none text-muted-soft">
                {activeKeyCount}/{statuses.length}
              </span>
              <Tabs.Indicator className="bg-surface-raised shadow-sm ring-1 ring-border-strong" />
            </Tabs.Tab>
            <Tabs.Tab
              id="profile"
              className="relative min-h-9 flex-1 rounded-lg px-4 text-[13.5px] font-medium whitespace-nowrap text-muted hover:text-foreground selected:text-foreground"
            >
              Profile
              <Tabs.Indicator className="bg-surface-raised shadow-sm ring-1 ring-border-strong" />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="connections" className="flex-1 space-y-3 text-sm outline-none">
          <p className="text-sm leading-relaxed text-muted">
            Connect read-only sources here. Pull new data with{" "}
            <span className="text-foreground">Sync my day</span> on Today.
          </p>
          <div className="space-y-2">
            {connectionCards.map((card) => {
              const connection = connectionByProvider.get(card.provider);
              const lastSync =
                typeof connection?.metadata?.lastSync === "string"
                  ? connection.metadata.lastSync
                  : null;
              const transport =
                connection?.status === "connected" &&
                (connection.metadata?.transport === "mcp" || connection.metadata?.transport === "api")
                  ? (connection.metadata.transport as ConnectionTransport)
                  : null;
              const authType =
                connection?.status === "connected" && connection.authType === "mcp"
                  ? "mcp"
                  : card.authType;
              const isConfluenceMcpSibling = card.provider === "confluence" && card.supportsMcp;
              const githubMetadata = connection?.metadata ?? null;
              return (
                <ConnectionCard
                  key={card.provider}
                  provider={card.provider}
                  label={card.label}
                  description={card.description}
                  authType={authType}
                  status={connection?.status ?? "disconnected"}
                  lastSync={lastSync}
                  metadata={githubMetadata}
                  setupHint={card.setupHint ?? null}
                  supportsMcp={card.supportsMcp ?? false}
                  mcpConnectUrl={card.mcpConnectUrl ?? null}
                  transport={transport}
                  hideMcpConnect={isConfluenceMcpSibling}
                  sharedMcpNote={
                    isConfluenceMcpSibling
                      ? "Shares the Atlassian MCP connection from Jira."
                      : null
                  }
                  mcpConnectLabel={card.provider === "jira" ? "Atlassian (Jira + Confluence)" : null}
                  patFallback={card.patFallback ?? false}
                  initialExpanded={connectedProvider === card.provider}
                  connectedExtra={
                    card.provider === "github" && connection?.status === "connected" ? (
                      <GitHubConnectionSettings
                        key={
                          typeof githubMetadata?.connectedAt === "string"
                            ? githubMetadata.connectedAt
                            : "github-setup"
                        }
                        setupKey={
                          typeof githubMetadata?.connectedAt === "string"
                            ? githubMetadata.connectedAt
                            : "github-setup"
                        }
                        initialRepository={
                          typeof githubMetadata?.workRepository === "string"
                            ? githubMetadata.workRepository
                            : null
                        }
                        initialBranch={
                          typeof githubMetadata?.workBranch === "string"
                            ? githubMetadata.workBranch
                            : null
                        }
                        login={
                          typeof githubMetadata?.login === "string" ? githubMetadata.login : null
                        }
                      />
                    ) : null
                  }
                />
              );
            })}
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="transcript" className="flex-1 space-y-3 text-sm outline-none">
          <p className="text-sm leading-relaxed text-muted">
            Paste meeting notes or a transcript — tasks and knowledge go straight into Today.
          </p>
          <IngestForm />
        </Tabs.Panel>

        <Tabs.Panel id="model-keys" className="flex-1 space-y-3 text-sm outline-none">
          <p className="text-sm leading-relaxed text-muted">
            Groq runs almost everything (free). OpenAI is only needed for knowledge search
            embeddings. Inactive providers are never called — Groq-only mode uses Groq for all
            text jobs; turn OpenAI on separately if you want search.
          </p>
          <div className="app-card divide-y divide-border">
            {statuses.map((status) => (
              <ApiKeyForm key={status.provider} initialStatus={status} />
            ))}
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="profile" className="flex-1 space-y-3 text-sm outline-none">
          <p className="text-sm leading-relaxed text-muted">
            Work email for OAuth context when connecting sources.
          </p>
          <ProfileForm initialEmail={profile?.email ?? null} initialName={profile?.name ?? null} />
        </Tabs.Panel>
      </Tabs>

      <SettingsHubLinks />
    </div>
  );
}
