import { NextResponse } from "next/server";
import { saveConnectionSecret } from "@/services/connectionSecrets";
import { upsertConnection } from "@/services/connections";
import {
  normalizeAtlassianSiteUrl,
  testAtlassianTokenCredentials,
  type AtlassianProvider,
} from "@/lib/connectors/atlassian";

// Jira and Confluence share one Atlassian account, so a single token connects
// both — the same shape the MCP callback uses.
const ATLASSIAN_PROVIDERS: AtlassianProvider[] = ["jira", "confluence"];

function readString(body: unknown, key: string): string {
  const value = (body as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = readString(body, "email");
  const apiToken = readString(body, "apiToken");
  const rawSiteUrl = readString(body, "siteUrl");

  if (!email || !apiToken || !rawSiteUrl) {
    return NextResponse.json(
      { error: "Email, API token, and site URL are all required." },
      { status: 400 }
    );
  }

  let siteUrl: string;
  try {
    siteUrl = normalizeAtlassianSiteUrl(rawSiteUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid Atlassian site URL." },
      { status: 400 }
    );
  }

  // Verify before persisting so a bad token never reaches a sync run.
  let identity;
  try {
    identity = await testAtlassianTokenCredentials({ email, apiToken, siteUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Atlassian connection test failed." },
      { status: 400 }
    );
  }

  const metadata = {
    connectedAt: new Date().toISOString(),
    transport: "api",
    atlassianAuth: "api_token",
    siteUrl,
    account: identity.displayName ?? identity.emailAddress ?? email,
  };

  for (const provider of ATLASSIAN_PROVIDERS) {
    await saveConnectionSecret(provider, {
      atlassianEmail: email,
      atlassianApiToken: apiToken,
      atlassianSiteUrl: siteUrl,
    });
    await upsertConnection({
      provider,
      authType: "api_key",
      status: "connected",
      scopes: [],
      metadata,
    });
  }

  return NextResponse.json({ ok: true, account: metadata.account, siteUrl });
}
