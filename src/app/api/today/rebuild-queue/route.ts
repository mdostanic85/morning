import { NextResponse } from "next/server";
import { rebuildTodayQueue } from "@/lib/tasks/prioritizer";

export async function POST() {
  const result = await rebuildTodayQueue();
  return NextResponse.json(result);
}
