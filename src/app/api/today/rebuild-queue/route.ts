import { NextResponse } from "next/server";
import { rebuildTodayQueue } from "@/lib/tasks/prioritizer";

export async function POST() {
  const result = await rebuildTodayQueue();

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Could not rebuild today queue." },
      { status: 400 }
    );
  }

  return NextResponse.json(result);
}
