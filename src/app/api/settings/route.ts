import { NextResponse } from "next/server";
import {
  getApiKeyStatuses,
  saveApiKey,
  clearApiKey,
  setProviderEnabled,
  LLM_PROVIDERS,
  type LlmProvider,
} from "@/services/settings";

export async function GET() {
  const statuses = await getApiKeyStatuses();
  return NextResponse.json({ statuses });
}

function isProvider(value: unknown): value is LlmProvider {
  return typeof value === "string" && (LLM_PROVIDERS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { provider, key } = body ?? {};

  if (!isProvider(provider) || typeof key !== "string" || key.trim().length === 0) {
    return NextResponse.json(
      { error: "A valid provider and non-empty key are required." },
      { status: 400 }
    );
  }

  await saveApiKey(provider, key);
  const statuses = await getApiKeyStatuses();
  return NextResponse.json({ statuses });
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const { provider } = body ?? {};

  if (!isProvider(provider)) {
    return NextResponse.json({ error: "A valid provider is required." }, { status: 400 });
  }

  await clearApiKey(provider);
  const statuses = await getApiKeyStatuses();
  return NextResponse.json({ statuses });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { provider, enabled } = body ?? {};

  if (!isProvider(provider) || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "A valid provider and enabled boolean are required." },
      { status: 400 }
    );
  }

  await setProviderEnabled(provider, enabled);
  const statuses = await getApiKeyStatuses();
  return NextResponse.json({ statuses });
}
