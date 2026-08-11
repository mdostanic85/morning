import "server-only";
import { getMcpCovers, type McpOAuthProvider } from "./capabilities";
import { readMcpOAuthState } from "./oauthProvider";
import { upsertConnection } from "@/services/connections";

export async function hasMcpTokens(provider: McpOAuthProvider): Promise<boolean> {
  const tokens = (await readMcpOAuthState(provider)).tokens;
  return Boolean(tokens?.access_token);
}

export async function markMcpConnectionsConnected(provider: McpOAuthProvider): Promise<void> {
  const connectedAt = new Date().toISOString();
  for (const covered of getMcpCovers(provider)) {
    await upsertConnection({
      provider: covered,
      authType: "mcp",
      status: "connected",
      scopes: [],
      metadata: {
        transport: "mcp",
        mcpProvider: provider,
        connectedAt,
      },
    });
  }
}
