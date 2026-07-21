import { getApiKeyStatuses } from "@/services/settings";
import { ApiKeyForm } from "@/components/ApiKeyForm";
import { ProfileForm } from "@/components/ProfileForm";
import { IngestForm } from "@/components/IngestForm";
import { IngestionRulesPanel } from "@/components/IngestionRulesPanel";
import { getConnections } from "@/services/connections";
import { getUserProfile } from "@/services/userProfile";
import { getProjects } from "@/services/projects";
import { listIngestionRules } from "@/services/ingestionRules";
import { ConnectionCard } from "@/components/ConnectionCard";
import { GitHubConnectionSettings } from "@/components/GitHubConnectionSettings";
import type { ConnectionTransport } from "@/domain/connection";
import { Tabs } from "@heroui/react/tabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
 searchParams,
}: {
 searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
 const [statuses, connections, profile, params, projects, ingestionRules] = await Promise.all([
 getApiKeyStatuses(),
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
 : `To enable direct API Connect, add ${vars} to .env.local (create the OAuth app at ${url}), then restart the dev server. MCP Connect works without these.`;

 const connectionCards = [
 {
 provider: "gmail",
 label: "Gmail",
 description:
 "Read-only Gmail sync for Gemini, Google Meet, meeting notes, and transcripts.",
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
 description:
 "Read-only sync for today’s meetings on your primary calendar. Powers the Today meetings panel.",
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
 description:
 "Read-only sync for issues assigned to you (any column) plus recent issues where you’re mentioned.",
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

 {/* Page header */}
 <div className="flex items-start justify-between gap-4">
 <div>
 <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
 <p className="mt-1.5 text-sm leading-relaxed text-muted">
 Local credentials for models and read-only source imports.
 Raw secrets never leave the browser.
 </p>
 </div>
 <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
 <span className="text-sm font-semibold text-foreground">
 {connectedCount}/{connectionCards.length} sources
 </span>
 <span className="text-sm text-muted-soft">
 {activeKeyCount}/{statuses.length} model keys
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

 {/* Tabs — HeroUI primary (segmented) */}
 <Tabs defaultSelectedKey="connections" className="w-full gap-5">
 <Tabs.ListContainer className="w-full">
 <Tabs.List aria-label="Settings sections" className="w-full">
 <Tabs.Tab id="connections" className="flex-1">
 Connections
 <span className="tabular-nums text-muted-soft">
 {connectedCount}/{connectionCards.length}
 </span>
 <Tabs.Indicator />
 </Tabs.Tab>
          <Tabs.Tab id="transcript" className="flex-1">
              Transcript
              <Tabs.Indicator />
            </Tabs.Tab>
          <Tabs.Tab id="rules" className="flex-1">
              Rules
              <Tabs.Indicator />
            </Tabs.Tab>
 <Tabs.Tab id="model-keys" className="flex-1">
 Model keys
 <span className="tabular-nums text-muted-soft">
 {activeKeyCount}/{statuses.length}
 </span>
 <Tabs.Indicator />
 </Tabs.Tab>
 <Tabs.Tab id="profile" className="flex-1">
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
 Paste meeting notes or a transcript — tasks and knowledge go straight into Today.
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
 Groq runs almost everything for free. OpenAI is only needed for knowledge search
 embeddings. Inactive providers are never called.
 </p>
 <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
 <div className="divide-y divide-border">
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
 </div>
 );
}
