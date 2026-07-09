import { NextResponse } from "next/server";
import { z } from "zod";
import { answerKnowledgeQuestion } from "@/lib/knowledge/qa";

const bodySchema = z.object({
  question: z.string().trim().min(1, "Question is required."),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const result = await answerKnowledgeQuestion(parsed.data.question);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Knowledge search failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
