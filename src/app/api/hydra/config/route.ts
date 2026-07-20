import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureHydraSetup, updateHydraTask } from "@/services/hydra";

const patchSchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  deliverySettings: z
    .object({ inApp: z.boolean(), email: z.boolean(), push: z.boolean() })
    .optional(),
});

export async function GET() {
  return NextResponse.json({ ok: true, ...(await ensureHydraSetup()) });
}

export async function PATCH(request: NextRequest) {
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, task: await updateHydraTask(parsed.data) });
}
