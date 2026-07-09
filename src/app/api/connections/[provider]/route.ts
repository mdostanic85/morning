import { NextResponse } from "next/server";
import { clearConnectionSecret } from "@/services/connectionSecrets";
import { getConnectionByProvider, getConnections, upsertConnection } from "@/services/connections";
import { isConnectionProvider } from "@/lib/connectors/providers";
import { getMcpCovers, isMcpOAuthProvider } from "@/lib/connectors/mcp/capabilities";
import { clearMcpOAuthState } from "@/lib/connectors/mcp/oauthProvider";
import { getMcpProvider, isMcpTransport } from "@/lib/connectors/transport";

export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  if (!isConnectionProvider(provider)) {
    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  }

  const connection = await getConnectionByProvider(provider);
  return NextResponse.json({ connection });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  if (!isConnectionProvider(provider)) {
    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  }

  await clearConnectionSecret(provider);
  const existing = await getConnectionByProvider(provider);
  if (existing && isMcpTransport(existing)) {
    const mcpProvider = getMcpProvider(existing) ?? "atlassian";
    if (isMcpOAuthProvider(mcpProvider)) {
      const siblings = getMcpCovers(mcpProvider).filter((covered) => covered !== provider);
      const connections = await getConnections();
      const siblingStillConnected = siblings.some((covered) => {
        const sibling = connections.find((item) => item.provider === covered);
        return sibling?.status === "connected" && isMcpTransport(sibling);
      });
      if (!siblingStillConnected) {
        clearMcpOAuthState(mcpProvider);
      }
    }
  }
  const disconnectedAt = new Date().toISOString();
  const wasMcp = existing && isMcpTransport(existing);
  const nextMetadata =
    provider === "github"
      ? { disconnectedAt }
      : (() => {
          const metadata = { ...(existing?.metadata ?? {}) };
          delete metadata.transport;
          delete metadata.mcpProvider;
          delete metadata.connectedAt;
          metadata.disconnectedAt = disconnectedAt;
          return metadata;
        })();

  const connection = await upsertConnection({
    provider,
    authType: wasMcp ? "oauth" : existing?.authType ?? "none",
    status: "disconnected",
    scopes: existing?.scopes ?? [],
    metadata: nextMetadata,
  });

  return NextResponse.json({ connection });
}
