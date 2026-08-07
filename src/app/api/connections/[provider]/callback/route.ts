import { NextResponse } from "next/server";
import {
  consumeOAuthState,
  exchangeCodeForToken,
  getOAuthConfig,
  getOAuthStateLinkedProviders,
  resolveOAuthCallbackProvider,
  type OAuthProvider,
} from "@/lib/connectors/oauth";
import { testGitHubConnection } from "@/lib/connectors/github";
import { isConnectionProvider, isOAuthProvider } from "@/lib/connectors/providers";
import { upsertConnection } from "@/services/connections";
import { saveConnectionSecret } from "@/services/connectionSecrets";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: urlProvider } = await context.params;
  if (!isConnectionProvider(urlProvider) || !isOAuthProvider(urlProvider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider." }, { status: 400 });
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const provider: OAuthProvider = await resolveOAuthCallbackProvider(urlProvider, state);
  // Read linked providers before consuming the state (consume deletes it).
  const linkedProviders = state ? await getOAuthStateLinkedProviders(state) : [];

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(oauthError)}`
    );
  }
  if (!code || !state || !(await consumeOAuthState(state, provider))) {
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent("Invalid or expired OAuth callback. Please try connecting again.")}`
    );
  }

  try {
    const secret = await exchangeCodeForToken({ provider, code, origin });
    const config = getOAuthConfig(provider);
    const metadata: Record<string, unknown> = {
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

    // Combined Google consent: replicate the single token to the other Google
    // providers so one sign-in connects Gmail + Calendar + Drive together.
    for (const linked of linkedProviders) {
      if (linked === provider) continue;
      await saveConnectionSecret(linked, secret);
      await upsertConnection({
        provider: linked,
        authType: "oauth",
        status: "connected",
        scopes: [...(getOAuthConfig(linked)?.scopes ?? [])],
        metadata: {
          connectedAt: new Date().toISOString(),
          transport: "api",
          linkedVia: "google",
        },
      });
    }

    const connectedLabel = linkedProviders.length > 0 ? "google" : provider;
    return NextResponse.redirect(`${origin}/settings?connected=${connectedLabel}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed.";
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(message)}`
    );
  }
}
