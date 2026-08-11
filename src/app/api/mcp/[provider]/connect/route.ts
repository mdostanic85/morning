import { NextResponse } from "next/server";
import { startMcpOAuthConnect } from "@/lib/connectors/mcp/client";
import { isMcpOAuthProvider } from "@/lib/connectors/mcp/capabilities";
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
  const force = url.searchParams.get("force") === "1";
  try {
    const redirectUrl = await startMcpOAuthConnect(provider, origin, { force });
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start MCP OAuth flow.";
    return NextResponse.redirect(
      `${origin}/settings?connection_error=${encodeURIComponent(message)}`
    );
  }
}
