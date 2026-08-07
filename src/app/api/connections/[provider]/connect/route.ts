import { NextResponse } from "next/server";
import { buildAuthorizationUrl, resolveAppOrigin } from "@/lib/connectors/oauth";
import { isConnectionProvider, isOAuthProvider } from "@/lib/connectors/providers";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  if (!isConnectionProvider(provider) || !isOAuthProvider(provider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider." }, { status: 400 });
  }

  const url = new URL(request.url);
  const origin = resolveAppOrigin(request.url);
  const linkGoogle = url.searchParams.get("link") === "google";
  try {
    return NextResponse.redirect(
      await buildAuthorizationUrl({ provider, origin, linkGoogle })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start OAuth flow.";
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(message)}`
    );
  }
}
