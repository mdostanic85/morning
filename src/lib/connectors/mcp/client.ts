import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  getMcpServerUrl,
  isMcpOAuthProvider,
  type McpOAuthProvider,
} from "./capabilities";
import { hasMcpTokens, markMcpConnectionsConnected } from "./connections";
import { clearMcpOAuthState, ConnectMcpOAuthProvider, FileMcpOAuthProvider } from "./oauthProvider";

function humanizeMcpOAuthError(provider: McpOAuthProvider, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (provider === "figma" && /403.*Forbidden/i.test(message)) {
    return new Error(
      "Figma remote MCP OAuth is only available to approved clients. Paste a read-only personal access token in Settings instead (Figma → Settings → Security → Personal access tokens)."
    );
  }
  return err instanceof Error ? err : new Error(message);
}

async function ensureFigmaMcpClientInfo(oauthProvider: ConnectMcpOAuthProvider) {
  const clientId = process.env.FIGMA_MCP_CLIENT_ID?.trim();
  const clientSecret = process.env.FIGMA_MCP_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return;
  if (oauthProvider.clientInformation()) return;
  await oauthProvider.saveClientInformation({
    client_id: clientId,
    client_secret: clientSecret,
    token_endpoint_auth_method: "client_secret_post",
  });
}

export async function startMcpOAuthConnect(
  provider: McpOAuthProvider,
  origin: string,
  options?: { force?: boolean }
): Promise<string> {
  if (options?.force) {
    clearMcpOAuthState(provider);
  } else if (await hasMcpTokens(provider)) {
    await markMcpConnectionsConnected(provider);
    return `${origin}/settings?connected=${provider}`;
  }

  const oauthProvider = new ConnectMcpOAuthProvider(provider, origin);
  const serverUrl = getMcpServerUrl(provider);
  try {
    if (provider === "figma") {
      await ensureFigmaMcpClientInfo(oauthProvider);
    }
    const result = await auth(oauthProvider, { serverUrl });
    if (result === "REDIRECT" && oauthProvider.authorizationUrl) {
      return oauthProvider.authorizationUrl.toString();
    }
    if (result === "AUTHORIZED") {
      await markMcpConnectionsConnected(provider);
      return `${origin}/settings?connected=${provider}`;
    }
    throw new Error("Could not start MCP OAuth flow.");
  } catch (err) {
    throw humanizeMcpOAuthError(provider, err);
  }
}

export async function finishMcpOAuthCallback(
  provider: McpOAuthProvider,
  origin: string,
  authorizationCode: string
): Promise<void> {
  const oauthProvider = new FileMcpOAuthProvider(provider, origin);
  const serverUrl = getMcpServerUrl(provider);
  const result = await auth(oauthProvider, { serverUrl, authorizationCode });
  if (result !== "AUTHORIZED") {
    throw new Error("MCP OAuth callback did not complete authorization.");
  }
}

export async function withMcpClient<T>(
  provider: McpOAuthProvider,
  origin: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const oauthProvider = new FileMcpOAuthProvider(provider, origin);
  const serverUrl = getMcpServerUrl(provider);
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    authProvider: oauthProvider,
  });
  const client = new Client({ name: "worklight", version: "1.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

export async function callMcpTool(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const text = Array.isArray(result.content)
      ? result.content
          .map((item) => (item.type === "text" ? item.text : ""))
          .filter(Boolean)
          .join("\n")
      : "MCP tool call failed.";
    throw new Error(text || `MCP tool ${name} failed.`);
  }
  return result.structuredContent ?? result.content;
}

export function assertMcpProvider(value: string): asserts value is McpOAuthProvider {
  if (!isMcpOAuthProvider(value)) {
    throw new Error(`Unsupported MCP provider: ${value}`);
  }
}
