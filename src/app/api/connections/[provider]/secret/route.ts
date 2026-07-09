import { NextResponse } from "next/server";
import { saveConnectionSecret } from "@/services/connectionSecrets";
import { upsertConnection } from "@/services/connections";
import { testDiscordConnection } from "@/lib/connectors/discord";
import { testFigmaConnection } from "@/lib/connectors/figma";
import { testGitHubConnection } from "@/lib/connectors/github";
import { testGranolaConnection } from "@/lib/connectors/granola";
import { isConnectionProvider } from "@/lib/connectors/providers";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  if (!isConnectionProvider(provider)) {
    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  }

  const body = await request.json();
  const secret = typeof body?.secret === "string" ? body.secret.trim() : "";
  if (!secret) {
    return NextResponse.json({ error: "Secret is required." }, { status: 400 });
  }

  if (provider === "granola") {
    await saveConnectionSecret(provider, { apiKey: secret });
  } else if (provider === "github" || provider === "figma") {
    await saveConnectionSecret(provider, { pat: secret });
  } else if (provider === "discord") {
    await saveConnectionSecret(provider, { botToken: secret });
  } else {
    return NextResponse.json({ error: "This provider uses OAuth." }, { status: 400 });
  }

  let metadata: Record<string, unknown> = { connectedAt: new Date().toISOString() };
  try {
    if (provider === "granola") metadata = { ...metadata, testOk: await testGranolaConnection() };
    if (provider === "github") metadata = { ...metadata, login: await testGitHubConnection() };
    if (provider === "figma") metadata = { ...metadata, handle: await testFigmaConnection() };
    if (provider === "discord") metadata = { ...metadata, testOk: await testDiscordConnection() };
  } catch (err) {
    const connection = await upsertConnection({
      provider,
      authType: provider === "github" || provider === "figma" ? "pat" : "api_key",
      status: "error",
      scopes: [],
      metadata: {
        ...metadata,
        error: err instanceof Error ? err.message : "Connection test failed.",
      },
    });
    return NextResponse.json({ connection }, { status: 400 });
  }

  const connection = await upsertConnection({
    provider,
    authType: provider === "github" || provider === "figma" ? "pat" : "api_key",
    status: "connected",
    scopes: [],
    metadata:
      provider === "figma"
        ? { ...metadata, transport: "api" }
        : metadata,
  });

  return NextResponse.json({ connection });
}
