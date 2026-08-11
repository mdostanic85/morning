import { NextResponse } from "next/server";
import {
  consumeOAuthState,
  exchangeCodeForToken,
  getOAuthConfig,
  getOAuthStateLinkedProviders,
  isGoogleOAuthProvider,
  resolveAppOrigin,
  resolveOAuthCallbackProvider,
  scopesGrantedForProvider,
  type OAuthProvider,
} from "@/lib/connectors/oauth";
import { testGitHubConnection } from "@/lib/connectors/github";
import { isConnectionProvider, isOAuthProvider } from "@/lib/connectors/providers";
import { upsertConnection } from "@/services/connections";
import { clearConnectionSecret, saveConnectionSecret } from "@/services/connectionSecrets";
import { requireAppUser } from "@/lib/auth/appUser";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: urlProvider } = await context.params;
  if (!isConnectionProvider(urlProvider) || !isOAuthProvider(urlProvider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider." }, { status: 400 });
  }

  const url = new URL(request.url);
  const origin = resolveAppOrigin(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const user = await requireAppUser();
  const provider: OAuthProvider = await resolveOAuthCallbackProvider(urlProvider, state, user.id);
  // Read linked providers before consuming the state (consume deletes it).
  const linkedProviders = state ? await getOAuthStateLinkedProviders(state, user.id) : [];

  if (oauthError) {
    if (state) await consumeOAuthState(state, provider, user.id);
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(oauthError)}`
    );
  }
  if (!code || !state || !(await consumeOAuthState(state, provider, user.id))) {
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent("Invalid or expired OAuth callback. Please try connecting again.")}`
    );
  }

  try {
    const grant = await exchangeCodeForToken({ provider, code, origin });
    const config = getOAuthConfig(provider);
    const grantedScopes =
      grant.grantedScopes.length > 0 || isGoogleOAuthProvider(provider)
        ? grant.grantedScopes
        : [...(config?.scopes ?? [])];
    const secret = {
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken,
      expiresAt: grant.expiresAt,
    };
    const metadata: Record<string, unknown> = {
      connectedAt: new Date().toISOString(),
      transport: "api",
    };

    const requestedProviders = linkedProviders.length > 0 ? linkedProviders : [provider];
    const connectedProviders: OAuthProvider[] = [];
    for (const linked of requestedProviders) {
      const expectedScopes = [...(getOAuthConfig(linked)?.scopes ?? [])];
      const providerScopes = isGoogleOAuthProvider(linked)
        ? scopesGrantedForProvider(linked, grantedScopes)
        : grantedScopes.length > 0
          ? grantedScopes
          : expectedScopes;
      if (isGoogleOAuthProvider(linked) && providerScopes.length !== expectedScopes.length) {
        await clearConnectionSecret(linked, user.id);
        await upsertConnection(
          {
            provider: linked,
            authType: "oauth",
            status: "disconnected",
            scopes: [],
            metadata: { permissionNotGrantedAt: new Date().toISOString() },
          },
          user.id
        );
        continue;
      }
      await saveConnectionSecret(linked, secret, user.id);
      await upsertConnection({
        provider: linked,
        authType: "oauth",
        status: "connected",
        scopes: providerScopes,
        metadata: {
          ...metadata,
          connectedAt: new Date().toISOString(),
          ...(linkedProviders.length > 0 ? { linkedVia: "google" } : {}),
        },
      }, user.id);
      connectedProviders.push(linked);
    }

    if (connectedProviders.length === 0) {
      throw new Error("None of the requested permissions were granted.");
    }

    if (provider === "github") {
      metadata.login = await testGitHubConnection();
      await upsertConnection({
        provider,
        authType: "oauth",
        status: "connected",
        scopes: scopesGrantedForProvider(provider, grantedScopes),
        metadata,
      }, user.id);
    }

    const connectedLabel = linkedProviders.length > 0 ? "google" : connectedProviders[0];
    return NextResponse.redirect(`${origin}/settings?connected=${connectedLabel}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed.";
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(message)}`
    );
  }
}
