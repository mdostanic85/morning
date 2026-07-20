import { NextResponse } from "next/server";
import { listTaskChatOptions } from "@/lib/tasks/taskQa";

export async function GET() {
  return NextResponse.json({ tasks: await listTaskChatOptions() });
}
