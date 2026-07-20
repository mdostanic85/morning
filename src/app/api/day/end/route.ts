import { NextResponse } from "next/server";
import { generateEndOfDayMemory } from "@/lib/tasks/dailyMemory";

export async function POST(request: Request) {
  let userNotes: string | null = null;
  try {
    const body = (await request.json()) as { userNotes?: unknown };
    if (typeof body.userNotes === "string") {
      userNotes = body.userNotes.trim() || null;
    }
  } catch {
    // Empty body is fine — notes are optional.
  }

  const result = await generateEndOfDayMemory({ userNotes });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Could not generate daily memory." },
      { status: 400 }
    );
  }
  return NextResponse.json({ memory: result.memory });
}
