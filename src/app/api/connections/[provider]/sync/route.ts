import { NextResponse } from "next/server";
import { isConnectionProvider } from "@/lib/connectors/providers";
import { syncProvider } from "@/lib/imports/syncProvider";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  if (!isConnectionProvider(provider)) {
    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const outcome = await syncProvider(provider, body);

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  return NextResponse.json(outcome.result);
}
