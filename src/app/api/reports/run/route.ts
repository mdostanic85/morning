import { NextResponse } from "next/server";
import { createHydraRun } from "@/services/hydra";

export async function POST() {
  const result = await createHydraRun({ runType: "manual" });
  return NextResponse.json({ ok: true, run: result.run, created: result.created }, { status: 201 });
}
