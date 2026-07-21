import { NextResponse } from "next/server";
import {
  createIngestionRule,
  listIngestionRules,
} from "@/services/ingestionRules";
import { SOURCE_TYPES, type SourceType } from "@/domain/sourceItem";

export async function GET() {
  const rules = await listIngestionRules();
  return NextResponse.json({ rules });
}

function isSourceType(value: unknown): value is SourceType {
  return typeof value === "string" && (SOURCE_TYPES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    rule?: string;
    sourceType?: string | null;
    projectId?: number | null;
  };
  if (typeof body.rule !== "string" || !body.rule.trim()) {
    return NextResponse.json({ error: "Rule text is required." }, { status: 400 });
  }
  const sourceType = isSourceType(body.sourceType) ? body.sourceType : null;
  const projectId = typeof body.projectId === "number" ? body.projectId : null;

  try {
    const rule = await createIngestionRule({ rule: body.rule, sourceType, projectId });
    return NextResponse.json({ rule });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create rule.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
