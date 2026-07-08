import { NextResponse } from "next/server";
import { ingestManualTranscript } from "@/services/sourceItems";

export async function POST(request: Request) {
  const body = await request.json();
  const { title, body: rawBody } = body ?? {};

  if (typeof rawBody !== "string" || rawBody.trim().length === 0) {
    return NextResponse.json({ error: "Transcript content is required." }, { status: 400 });
  }

  const result = await ingestManualTranscript({
    title: typeof title === "string" ? title : "",
    body: rawBody,
  });

  return NextResponse.json(result);
}
