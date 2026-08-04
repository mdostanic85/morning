import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_PUBLIC_RESEARCH_CHARS, researchPublicText } from "@/lib/research/publicResearch";

/**
 * The public/cheap LLM path (Gemini). Send only public reference material —
 * documentation, changelogs, vendor descriptions. Personal content from the
 * user's connected sources has its own jobs on the other providers.
 */
const bodySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Public material is required.")
    .max(
      MAX_PUBLIC_RESEARCH_CHARS,
      `Material must be ${MAX_PUBLIC_RESEARCH_CHARS} characters or fewer.`
    ),
  question: z.string().trim().min(1).optional(),
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
    const result = await researchPublicText(parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ model: result.model, ...result.research });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Public research failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
