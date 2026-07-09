import { NextResponse } from "next/server";
import { buildAuthorizationUrl } from "@/lib/connectors/oauth";
import { isConnectionProvider, isOAuthProvider } from "@/lib/connectors/providers";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  if (!isConnectionProvider(provider) || !isOAuthProvider(provider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  try {
    return NextResponse.redirect(buildAuthorizationUrl({ provider, origin }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start OAuth flow.";
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(message)}`
    );
  }
}
