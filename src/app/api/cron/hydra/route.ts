import { NextRequest, NextResponse } from "next/server";
import { runDueHydraSchedules } from "@/lib/hydra/scheduler";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const executions = await runDueHydraSchedules();
  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), executions });
}

export const GET = handle;
export const POST = handle;
