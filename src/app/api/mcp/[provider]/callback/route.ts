import { NextResponse } from "next/server";
import { finishMcpOAuthCallback } from "@/lib/connectors/mcp/client";
import { isMcpOAuthProvider } from "@/lib/connectors/mcp/capabilities";
import { markMcpConnectionsConnected } from "@/lib/connectors/mcp/connections";
import { resolveAppOrigin } from "@/lib/connectors/oauth";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  if (!isMcpOAuthProvider(provider)) {
    return NextResponse.json({ error: "Unsupported MCP provider." }, { status: 400 });
  }

  const url = new URL(request.url);
  const origin = resolveAppOrigin(request.url);
  const code = url.searchParams.get("code");
  const oauthState = url.searchParams.get("state");
  const oauthError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(oauthError)}`
    );
  }
  if (!code) {
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent("Missing OAuth authorization code.")}`
    );
  }

  try {
    await finishMcpOAuthCallback(provider, origin, code, oauthState);
    await markMcpConnectionsConnected(provider);
    return NextResponse.redirect(`${origin}/settings?connected=${provider}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "MCP OAuth callback failed.";
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(message)}`
    );
  }
}
