import { NextResponse } from "next/server";
import { clearConnectionSecret } from "@/services/connectionSecrets";
import { getConnectionByProvider, getConnections, upsertConnection } from "@/services/connections";
import { isConnectionProvider } from "@/lib/connectors/providers";
import { getMcpCovers, isMcpOAuthProvider } from "@/lib/connectors/mcp/capabilities";
import { clearMcpOAuthState } from "@/lib/connectors/mcp/oauthProvider";
import { getMcpProvider, isMcpTransport } from "@/lib/connectors/transport";
import { requireAppUser } from "@/lib/auth/appUser";
import {
  GOOGLE_LINKED_PROVIDERS,
  isGoogleOAuthProvider,
  revokeGoogleToken,
} from "@/lib/connectors/oauth";
import { getConnectionSecret } from "@/services/connectionSecrets";

export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  if (!isConnectionProvider(provider)) {
    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  }

  const user = await requireAppUser();
  const connection = await getConnectionByProvider(provider, user.id);
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

  const user = await requireAppUser();

  if (isGoogleOAuthProvider(provider)) {
    const existing = await getConnectionByProvider(provider, user.id);
    const secret = await getConnectionSecret(provider, user.id);
    const token = secret?.refreshToken ?? secret?.accessToken;
    if (token) await revokeGoogleToken(token);

    const disconnectedAt = new Date().toISOString();
    const affectedProviders =
      existing?.metadata?.linkedVia === "google"
        ? [...GOOGLE_LINKED_PROVIDERS]
        : [provider];
    const connections = await Promise.all(
      affectedProviders.map(async (linked) => {
        await clearConnectionSecret(linked, user.id);
        const linkedConnection = await getConnectionByProvider(linked, user.id);
        return upsertConnection(
          {
            provider: linked,
            authType: "oauth",
            status: "disconnected",
            scopes: [],
            metadata: { ...(linkedConnection?.metadata ?? {}), disconnectedAt },
          },
          user.id
        );
      })
    );
    return NextResponse.json({ connections });
  }

  await clearConnectionSecret(provider, user.id);
  const existing = await getConnectionByProvider(provider, user.id);
  if (existing && isMcpTransport(existing)) {
    const mcpProvider = getMcpProvider(existing) ?? "atlassian";
    if (isMcpOAuthProvider(mcpProvider)) {
      const siblings = getMcpCovers(mcpProvider).filter((covered) => covered !== provider);
      const connections = await getConnections(user.id);
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
  }, user.id);

  return NextResponse.json({ connection });
}
