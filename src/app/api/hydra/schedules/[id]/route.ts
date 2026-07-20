import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateHydraSchedule } from "@/services/hydra";

const patchSchema = z.object({
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  timezone: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const scheduleId = Number(id);
  const parsed = patchSchema.safeParse(await request.json());
  if (!Number.isInteger(scheduleId) || !parsed.success) {
    return NextResponse.json({ error: "Invalid schedule update." }, { status: 400 });
  }
  const schedule = await updateHydraSchedule(scheduleId, parsed.data);
  if (!schedule) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  return NextResponse.json({ ok: true, schedule });
}
