/**
 * One-off probe: list Jira projects and issues via Atlassian MCP.
 * Run: npx tsx scripts/probe-jira-mcp.mts
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";

const ORIGIN = process.env.MORNING_APP_URL?.trim() || "http://localhost:3000";
const SERVER_URL = "https://mcp.atlassian.com/v1/mcp/authv2";
const OAUTH_FILE = path.join(process.cwd(), "data/mcp-oauth/atlassian.json");

function readOAuth() {
  return JSON.parse(fs.readFileSync(OAUTH_FILE, "utf-8")) as {
    clientInformation?: unknown;
    tokens?: { access_token?: string; refresh_token?: string };
    codeVerifier?: string;
    discoveryState?: unknown;
  };
}

function writeOAuth(data: ReturnType<typeof readOAuth>) {
  fs.writeFileSync(OAUTH_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

class ProbeOAuthProvider implements OAuthClientProvider {
  get redirectUrl() {
    return new URL("/api/mcp/atlassian/callback", ORIGIN);
  }
  get clientMetadata() {
    return {
      client_name: "Vantage",
      redirect_uris: [this.redirectUrl.toString()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none" as const,
    };
  }
  clientInformation() {
    return readOAuth().clientInformation as ReturnType<OAuthClientProvider["clientInformation"]>;
  }
  async saveClientInformation(info: NonNullable<ReturnType<OAuthClientProvider["clientInformation"]>>) {
    const data = readOAuth();
    data.clientInformation = info;
    writeOAuth(data);
  }
  tokens() {
    return readOAuth().tokens as ReturnType<OAuthClientProvider["tokens"]>;
  }
  async saveTokens(tokens: NonNullable<Awaited<ReturnType<OAuthClientProvider["tokens"]>>>) {
    const data = readOAuth();
    data.tokens = tokens;
    writeOAuth(data);
  }
  redirectToAuthorization() {
    throw new Error("Not in probe flow");
  }
  saveCodeVerifier(v: string) {
    const data = readOAuth();
    data.codeVerifier = v;
    writeOAuth(data);
  }
  codeVerifier() {
    return readOAuth().codeVerifier ?? "";
  }
  discoveryState() {
    return readOAuth().discoveryState as ReturnType<OAuthClientProvider["discoveryState"]>;
  }
  async saveDiscoveryState(state: NonNullable<Awaited<ReturnType<OAuthClientProvider["discoveryState"]>>>) {
    const data = readOAuth();
    data.discoveryState = state;
    writeOAuth(data);
  }
  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier") {
    const data = readOAuth();
    if (scope === "all" || scope === "tokens") delete data.tokens;
    if (scope === "all" || scope === "client") delete data.clientInformation;
    if (scope === "all" || scope === "verifier") delete data.codeVerifier;
    writeOAuth(data);
  }
}

function parsePayload(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const record = result as { content?: unknown[]; structuredContent?: unknown };
  if (record.structuredContent) return record.structuredContent;
  const text = Array.isArray(record.content)
    ? record.content
        .map((item) =>
          item && typeof item === "object" && "text" in item ? String((item as { text: string }).text) : ""
        )
        .filter(Boolean)
        .join("\n")
    : "";
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(`Tool ${name} failed: ${JSON.stringify(result.content)}`);
  }
  return parsePayload(result);
}

async function main() {
  const oauthFile = path.join(process.cwd(), "data/mcp-oauth/atlassian.json");
  if (!fs.existsSync(oauthFile)) {
    console.error("No MCP tokens — connect Atlassian in Settings first.");
    process.exit(1);
  }

  const oauthProvider = new ProbeOAuthProvider();
  const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL), {
    authProvider: oauthProvider,
  });
  const client = new Client({ name: "morning-probe", version: "1.0.0" });
  await client.connect(transport);

  try {
    const resources = (await callTool(client, "getAccessibleAtlassianResources", {})) as unknown[];
    console.log("=== Atlassian sites ===");
    for (const r of resources ?? []) {
      const site = r as { id?: string; name?: string; url?: string };
      console.log(`  ${site.name ?? "?"} (${site.id}) ${site.url ?? ""}`);
    }

    const cloudId = (resources?.[0] as { id?: string })?.id;
    if (!cloudId) throw new Error("No cloud id");

    const projectsRaw = await callTool(client, "getVisibleJiraProjects", { cloudId });
    const record = projectsRaw as { values?: { key?: string; name?: string }[] };
    const projectList = record?.values ?? [];
    console.log(`\n=== Jira projects (${projectList.length} visible) ===`);
    const hydraProjects = projectList.filter(
      (p) => /hydra/i.test(p.name ?? "") || /hydra/i.test(p.key ?? "")
    );
    console.log("\nHydra-related:");
    for (const p of hydraProjects) {
      console.log(`  ${p.key}: ${p.name}`);
    }
    console.log("\nAll project keys:");
    for (const p of projectList) {
      console.log(`  ${p.key}: ${p.name}`);
    }

    const issuesRaw = await callTool(client, "searchJiraIssuesUsingJql", {
      cloudId,
      jql: "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
      maxResults: 5,
    });
    console.log("\n=== My open issues (sample) ===");
    const issues = (issuesRaw as { issues?: { key: string; fields?: { summary?: string; project?: { key?: string; name?: string } } }[] })?.issues ?? [];
    for (const issue of issues) {
      const proj = issue.fields?.project;
      console.log(`  ${issue.key}: ${issue.fields?.summary} [${proj?.key} / ${proj?.name}]`);
    }

    for (const key of ["HYDRA", "Hydra", "hydra"]) {
      try {
        const hydra = await callTool(client, "searchJiraIssuesUsingJql", {
          cloudId,
          jql: `project = "${key}" ORDER BY updated DESC`,
          maxResults: 3,
        });
        const hydraIssues = (hydra as { issues?: { key: string; fields?: { summary?: string } }[] })?.issues ?? [];
        if (hydraIssues.length > 0) {
          console.log(`\n=== Project ${key} issues ===`);
          for (const issue of hydraIssues) {
            console.log(`  ${issue.key}: ${issue.fields?.summary}`);
          }
        }
      } catch (e) {
        console.log(`\n=== Project ${key}: ${e instanceof Error ? e.message : e} ===`);
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
