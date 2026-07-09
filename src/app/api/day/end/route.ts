import { NextResponse } from "next/server";
import { generateEndOfDayMemory } from "@/lib/tasks/dailyMemory";

export async function POST() {
  const result = await generateEndOfDayMemory();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Could not generate daily memory." },
      { status: 400 }
    );
  }
  return NextResponse.json({ memory: result.memory });
}
