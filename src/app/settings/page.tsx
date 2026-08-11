import { getApiKeyStatuses, getLocalLlmStatus } from "@/services/settings";
import { ApiKeyForm } from "@/components/ApiKeyForm";
import { LocalLlmForm } from "@/components/LocalLlmForm";
import { ProfileForm } from "@/components/ProfileForm";
import { IngestForm } from "@/components/IngestForm";
import { IngestionRulesPanel } from "@/components/IngestionRulesPanel";
import { getConnections } from "@/services/connections";
import { getUserProfile } from "@/services/userProfile";
import { getProjects } from "@/services/projects";
import { listIngestionRules } from "@/services/ingestionRules";
import { ConnectionCard } from "@/components/ConnectionCard";
import { GoogleConnectionPanel } from "@/components/GoogleConnectionPanel";
import { GitHubConnectionSettings } from "@/components/GitHubConnectionSettings";
import type { ConnectionTransport } from "@/domain/connection";
import { Tabs } from "@heroui/react/tabs";
import { Heading } from "@/components/Heading";
import { SettingsHubLinks } from "@/components/SettingsHubLinks";
import { SignOutControl } from "@/components/auth/SignOutControl";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
 searchParams,
}: {
 searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
 const [statuses, localLlm, connections, profile, params, projects, ingestionRules] = await Promise.all([
 getApiKeyStatuses(),
 getLocalLlmStatus(),
 getConnections(),
 getUserProfile(),
 searchParams,
 getProjects(),
 listIngestionRules(),
 ]);

 const connectionError =
 typeof params.connection_error === "string" ? params.connection_error : null;
 const connectedProvider = typeof params.connected === "string" ? params.connected : null;
 const connectionByProvider = new Map(connections.map((c) => [c.provider, c]));

 const hasEnv = (...names: string[]) => names.every((n) => Boolean(process.env[n]?.trim()));
 const oauthSetupHint = (configured: boolean, vars: string, url: string) =>
 configured
 ? null
 : `To enable direct API access, add ${vars} to .env.local, create the OAuth app at ${url}, then restart the app. Connected app access works without these keys.`;

  const googleConfigured =
    hasEnv("GOOGLE_INTEGRATIONS_CLIENT_ID", "GOOGLE_INTEGRATIONS_CLIENT_SECRET") ||
    (process.env.NODE_ENV !== "production" &&
      hasEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"));
  const googleProviders = [
    {
      provider: "gmail",
      label: "Gmail",
      description: "Read matching email and Gemini meeting-note messages.",
    },
    {
      provider: "calendar",
      label: "Google Calendar",
      description: "Read calendar events used in your daily brief.",
    },
    {
      provider: "drive",
      label: "Google Drive",
      description: "Read matching Drive files and export supported documents.",
    },
  ] as const;
  const googleSources = googleProviders.map(({ provider, label, ...presentation }) => {
    const connection = connectionByProvider.get(provider);
    return {
      provider,
      label,
      ...presentation,
      status: connection?.status ?? "disconnected",
      lastSync:
        typeof connection?.metadata?.lastSync === "string" ? connection.metadata.lastSync : null,
    };
  });
  const googleAllConnected = googleSources.every((source) => source.status === "connected");
  const googleRedirectUri = `${(process.env.WORKLIGHT_APP_URL?.trim() || "https://worklight.vercel.app").replace(/\/+$/, "")}/api/connections/gmail/callback`;
  const googleSetupHint = !googleConfigured
    ? oauthSetupHint(false, "GOOGLE_INTEGRATIONS_CLIENT_ID and GOOGLE_INTEGRATIONS_CLIENT_SECRET", "console.cloud.google.com")
    : googleAllConnected
      ? null
      : `In Google Cloud → Credentials → your Web client, Authorized redirect URIs must include exactly: ${googleRedirectUri}`;

  const connectionCards = [
    {
      provider: "jira",
 label: "Jira",
 description:
 "Read-only sync for issues assigned to you, plus recent issues where you're mentioned.",
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
 description:
 "Read-only sync for selected spaces and page URLs. Shares Atlassian MCP with Jira.",
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
 "Read-only sync for meeting notes and transcripts. Sign in through the connected app, or paste a Granola API key.",
 authType: "api_key" as const,
 supportsMcp: true,
 mcpConnectUrl: "/api/mcp/granola/connect",
 },
 {
 provider: "github",
 label: "GitHub",
 description:
 "Read-only sync for pull requests, comments, and checks. Sign in, then choose a repository and branch.",
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
 "Read-only design context for delivery checks. Paste a personal access token from Figma Settings, under Security.",
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

  const nonGoogleConnectedCount = connectionCards.filter(
    (card) => connectionByProvider.get(card.provider)?.status === "connected"
  ).length;
  const connectedCount = nonGoogleConnectedCount + (googleAllConnected ? 1 : 0);
  const totalSources = connectionCards.length + 1;
  const activeKeyCount =
    statuses.filter((s) => s.configured && s.enabled).length +
    (localLlm.configured && localLlm.enabled ? 1 : 0);
  const modelProviderCount = statuses.length + 1;

 return (
 <div className="space-y-6">

 {/* Page header */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
 <div>
 <Heading level={1} visualLevel={3}>Settings</Heading>
 <p className="mt-1.5 text-sm leading-relaxed text-muted">
 Local credentials for models and read-only source imports.
 Raw secrets never leave the browser.
 </p>
 </div>
 <div className="flex shrink-0 gap-4 pt-0.5 sm:flex-col sm:items-end sm:gap-1">
 <span className="text-sm font-semibold text-foreground">
                {connectedCount}/{totalSources} sources
 </span>
 <span className="text-sm text-muted-soft">
 {activeKeyCount}/{modelProviderCount} model providers
 </span>
 </div>
 </div>

 {/* Alerts */}
 {connectionError ? (
 <div className="rounded-[var(--radius)] border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
 <span className="font-semibold">Connection failed: </span>
 {connectionError}
 </div>
 ) : null}

 {connectedProvider ? (
 <div className="rounded-[var(--radius)] border border-good/35 bg-good/10 px-4 py-3 text-sm text-good">
 <span className="font-semibold capitalize">{connectedProvider}</span> connected
 successfully.
 </div>
 ) : null}

 <Tabs defaultSelectedKey="connections" className="w-full gap-5">
 <Tabs.ListContainer className="w-full">
 <Tabs.List aria-label="Settings sections" className="grid w-full grid-cols-2 gap-1 sm:flex">
 <Tabs.Tab id="connections" className="!h-11 !min-h-11 w-full min-w-0 sm:flex-1">
 Connections
 <span className="tabular-nums text-muted-soft">
                {connectedCount}/{totalSources}
              </span>
 <Tabs.Indicator />
 </Tabs.Tab>
          <Tabs.Tab id="transcript" className="!h-11 !min-h-11 w-full min-w-0 sm:flex-1">
              Transcript
              <Tabs.Indicator />
            </Tabs.Tab>
          <Tabs.Tab id="rules" className="!h-11 !min-h-11 w-full min-w-0 sm:flex-1">
              Rules
              <Tabs.Indicator />
            </Tabs.Tab>
 <Tabs.Tab id="model-keys" className="!h-11 !min-h-11 w-full min-w-0 sm:flex-1">
 Model keys
 <span className="tabular-nums text-muted-soft">
 {activeKeyCount}/{modelProviderCount}
 </span>
 <Tabs.Indicator />
 </Tabs.Tab>
 <Tabs.Tab id="profile" className="!h-11 !min-h-11 w-full min-w-0 sm:flex-1">
 Profile
 <Tabs.Indicator />
 </Tabs.Tab>
 </Tabs.List>
 </Tabs.ListContainer>

 {/* ── Connections ─────────────────────────────────────────────────── */}
          <Tabs.Panel id="connections" className="space-y-4">
            <p className="text-sm leading-relaxed text-muted">
              Connect read-only sources. Pull fresh data with{" "}
              <span className="font-medium text-foreground">Sync my day</span> on Today.
            </p>
            <GoogleConnectionPanel
              sources={googleSources}
              configured={googleConfigured}
              setupHint={googleSetupHint}
            />
            <div className="flex flex-col gap-4">
 {connectionCards.map((card) => {
 const connection = connectionByProvider.get(card.provider);
 const lastSync =
 typeof connection?.metadata?.lastSync === "string"
 ? connection.metadata.lastSync
 : null;
 const transport =
 connection?.status === "connected" &&
 (connection.metadata?.transport === "mcp" ||
 connection.metadata?.transport === "api")
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
 isConfluenceMcpSibling ? "Shares the Atlassian MCP connection from Jira." : null
 }
 mcpConnectLabel={
 card.provider === "jira" ? "Atlassian (Jira + Confluence)" : null
 }
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
 typeof githubMetadata?.login === "string"
 ? githubMetadata.login
 : null
 }
 />
 ) : null
 }
 />
 );
 })}
 </div>
 </Tabs.Panel>

 {/* ── Manual transcript ──────────────────────────────────────────── */}
 <Tabs.Panel id="transcript" className="space-y-4">
 <div>
 <p className="text-sm leading-relaxed text-muted">
 Paste meeting notes or a transcript. Tasks and knowledge go straight into Today.
 </p>
 </div>
          <IngestForm />
        </Tabs.Panel>

        {/* ── Extraction rules ───────────────────────────────────────────── */}
        <Tabs.Panel id="rules" className="space-y-4">
          <IngestionRulesPanel
            initialRules={ingestionRules}
            projects={projects.map((project) => ({ id: project.id, name: project.name }))}
          />
        </Tabs.Panel>

        {/* ── Model keys ─────────────────────────────────────────────────── */}
 <Tabs.Panel id="model-keys" className="space-y-4">
 <p className="text-sm leading-relaxed text-muted">
 A configured Local LLM is a last-resort fallback after enabled cloud models.
 OpenAI is still used for knowledge-search embeddings.
 </p>
 <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
 <div className="divide-y divide-border">
 <LocalLlmForm initialStatus={localLlm} />
 {statuses.map((status) => (
 <ApiKeyForm key={status.provider} initialStatus={status} />
 ))}
 </div>
 </div>
 </Tabs.Panel>

 {/* ── Profile ────────────────────────────────────────────────────── */}
 <Tabs.Panel id="profile" className="space-y-4">
 <p className="text-sm leading-relaxed text-muted">
 Your name helps the app filter tasks assigned to you. Email is used for OAuth context
 when connecting sources.
 </p>
 <ProfileForm
 initialEmail={profile?.email ?? null}
 initialName={profile?.name ?? null}
 />
 </Tabs.Panel>
 </Tabs>
 <SettingsHubLinks />
 <div className="border-t border-border pt-4 md:hidden">
   <SignOutControl />
 </div>
 </div>
 );
}
