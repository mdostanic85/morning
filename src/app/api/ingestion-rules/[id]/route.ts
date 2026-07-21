import { NextResponse } from "next/server";
import { deleteIngestionRule, setIngestionRuleActive } from "@/services/ingestionRules";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = Number(id);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Invalid rule id." }, { status: 400 });
  }
  const body = (await request.json()) as { active?: boolean };
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "'active' must be a boolean." }, { status: 400 });
  }
  const rule = await setIngestionRuleActive(parsedId, body.active);
  if (!rule) {
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  }
  return NextResponse.json({ rule });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = Number(id);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Invalid rule id." }, { status: 400 });
  }
  await deleteIngestionRule(parsedId);
  return NextResponse.json({ ok: true });
}
