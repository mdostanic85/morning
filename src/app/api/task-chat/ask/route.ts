import { NextResponse } from "next/server";
import { z } from "zod";
import {
  answerGeneralWorkQuestion,
  answerTaskQuestion,
} from "@/lib/tasks/taskQa";

const bodySchema = z.object({
  taskId: z.number().int().positive().optional(),
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
    return NextResponse.json(
      parsed.data.taskId
        ? await answerTaskQuestion(parsed.data.taskId, parsed.data.question)
        : await answerGeneralWorkQuestion(parsed.data.question)
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Task question failed." },
      { status: 500 }
    );
  }
}
