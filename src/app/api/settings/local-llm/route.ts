import { NextResponse } from "next/server";
import {
  clearLocalLlmConfig,
  getLocalLlmStatus,
  saveLocalLlmConfig,
  setProviderEnabled,
} from "@/services/settings";

export async function GET() {
  return NextResponse.json({ status: await getLocalLlmStatus() });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl : "";
    const model = typeof body?.model === "string" ? body.model : "";
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey : undefined;

    if (!baseUrl.trim() || !model.trim()) {
      return NextResponse.json(
        { error: "Base URL and model are required." },
        { status: 400 }
      );
    }

    await saveLocalLlmConfig({ baseUrl, model, apiKey });
    return NextResponse.json({ status: await getLocalLlmStatus() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save Local LLM." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json(
        { error: "An enabled boolean is required." },
        { status: 400 }
      );
    }

    const current = await getLocalLlmStatus();
    if (body.enabled && !current.configured) {
      return NextResponse.json(
        { error: "Save a Local LLM base URL and model before enabling it." },
        { status: 400 }
      );
    }

    await setProviderEnabled("local", body.enabled);
    return NextResponse.json({ status: await getLocalLlmStatus() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update Local LLM." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearLocalLlmConfig();
    await setProviderEnabled("local", false);
    return NextResponse.json({ status: await getLocalLlmStatus() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not clear Local LLM." },
      { status: 500 }
    );
  }
}
