import { NextResponse } from "next/server";
import { consumeOAuthState, exchangeCodeForToken, getOAuthConfig } from "@/lib/connectors/oauth";
import { testGitHubConnection } from "@/lib/connectors/github";
import { isConnectionProvider, isOAuthProvider } from "@/lib/connectors/providers";
import { upsertConnection } from "@/services/connections";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  if (!isConnectionProvider(provider) || !isOAuthProvider(provider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider." }, { status: 400 });
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(oauthError)}`
    );
  }
  if (!code || !state || !consumeOAuthState(state, provider)) {
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent("Invalid or expired OAuth callback. Please try connecting again.")}`
    );
  }

  try {
    await exchangeCodeForToken({ provider, code, origin });
    const config = getOAuthConfig(provider);
    let metadata: Record<string, unknown> = {
      connectedAt: new Date().toISOString(),
      transport: "api",
    };
    if (provider === "github") {
      metadata.login = await testGitHubConnection();
    }
    await upsertConnection({
      provider,
      authType: "oauth",
      status: "connected",
      scopes: [...(config?.scopes ?? [])],
      metadata,
    });
    return NextResponse.redirect(`${origin}/settings?connected=${provider}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed.";
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(message)}`
    );
  }
}
