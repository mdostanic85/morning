import { NextResponse } from "next/server";
import {
  getApiKeyStatuses,
  saveApiKey,
  clearApiKey,
  setProviderEnabled,
  CLOUD_LLM_PROVIDERS,
  type CloudLlmProvider,
} from "@/services/settings";

export async function GET() {
  const statuses = await getApiKeyStatuses();
  return NextResponse.json({ statuses });
}

function isProvider(value: unknown): value is CloudLlmProvider {
  return (
    typeof value === "string" &&
    (CLOUD_LLM_PROVIDERS as readonly string[]).includes(value)
  );
}

export async function POST(request: Request) {
  try {
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the key." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { provider } = body ?? {};

    if (!isProvider(provider)) {
      return NextResponse.json({ error: "A valid provider is required." }, { status: 400 });
    }

    await clearApiKey(provider);
    const statuses = await getApiKeyStatuses();
    return NextResponse.json({ statuses });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove the key." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update provider." },
      { status: 500 }
    );
  }
}
