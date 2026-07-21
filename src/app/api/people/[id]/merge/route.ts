import { NextResponse } from "next/server";
import { getPersonById, mergePersonInto } from "@/services/people";

/**
 * WL-10: the only way two distinct person entities ever become one. Always
 * an explicit, separate confirmed action — never called automatically from
 * extraction (ai-safety: no silent merges of potentially different people).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sourcePersonId = Number(id);
  if (!Number.isInteger(sourcePersonId) || sourcePersonId <= 0) {
    return NextResponse.json({ error: "Invalid person id." }, { status: 400 });
  }

  const body = (await request.json()) as { targetPersonId?: number; confirmed?: boolean };
  if (!body.confirmed) {
    return NextResponse.json(
      { error: "Merge requires explicit confirmation (confirmed: true)." },
      { status: 400 }
    );
  }
  if (typeof body.targetPersonId !== "number") {
    return NextResponse.json({ error: "targetPersonId is required." }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    getPersonById(sourcePersonId),
    getPersonById(body.targetPersonId),
  ]);
  if (!source || !target) {
    return NextResponse.json({ error: "Person not found." }, { status: 404 });
  }

  await mergePersonInto(sourcePersonId, body.targetPersonId);
  return NextResponse.json({ ok: true });
}
