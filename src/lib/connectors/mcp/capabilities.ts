import "server-only";

export const MCP_OAUTH_PROVIDERS = {
  atlassian: {
    serverUrl: "https://mcp.atlassian.com/v1/mcp/authv2",
    covers: ["jira", "confluence"] as const,
    label: "Atlassian",
  },
  granola: {
    serverUrl: "https://mcp.granola.ai/mcp",
    covers: ["granola"] as const,
    label: "Granola",
  },
  figma: {
    serverUrl: "https://mcp.figma.com/mcp",
    covers: ["figma"] as const,
    label: "Figma",
  },
} as const;

export type McpOAuthProvider = keyof typeof MCP_OAUTH_PROVIDERS;

export function isMcpOAuthProvider(value: string): value is McpOAuthProvider {
  return value in MCP_OAUTH_PROVIDERS;
}

export function getMcpServerUrl(provider: McpOAuthProvider): string {
  return MCP_OAUTH_PROVIDERS[provider].serverUrl;
}

export function getMcpCovers(provider: McpOAuthProvider): readonly string[] {
  return MCP_OAUTH_PROVIDERS[provider].covers;
}
