import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { getLastTestPingResult } from "@/inngest/testState";

export async function POST(request: Request) {
  let note = "local validation";
  try {
    const body = (await request.json()) as { note?: string };
    if (typeof body.note === "string" && body.note.trim()) {
      note = body.note.trim();
    }
  } catch {
    // Empty body is fine for the default note.
  }

  const { ids } = await inngest.send({
    name: "worklight/test.ping",
    data: { note },
  });

  return NextResponse.json({
    ok: true,
    event: "worklight/test.ping",
    eventIds: ids,
    note,
  });
}

export async function GET() {
  const lastResult = getLastTestPingResult();
  return NextResponse.json({
    ok: true,
    lastResult,
  });
}
