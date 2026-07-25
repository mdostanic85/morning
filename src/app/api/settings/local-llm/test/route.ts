import { NextResponse } from "next/server";
import { z } from "zod";
import { localClient } from "@/lib/llm/local";
import { getLocalLlmConfig } from "@/services/settings";

const testSchema = z.object({ ok: z.literal(true) });

export async function POST() {
  const config = await getLocalLlmConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Save a Local LLM base URL and model first." },
      { status: 400 }
    );
  }

  try {
    const result = await localClient.complete({
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt: 'Return JSON only, exactly: {"ok":true}',
      userPrompt: "Confirm that the local model is reachable.",
      temperature: 0,
      maxTokens: 32,
      responseJsonSchema: z.toJSONSchema(testSchema, { io: "output" }) as Record<
        string,
        unknown
      >,
    });
    let json: unknown;
    try {
      json = JSON.parse(result.text);
    } catch {
      return NextResponse.json(
        {
          error:
            "Local model responded without valid JSON. Disable thinking/reasoning for this model or try a larger output limit.",
        },
        { status: 502 }
      );
    }

    const parsed = testSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Local model responded, but did not return the required JSON." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, model: config.model });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Local LLM test failed." },
      { status: 502 }
    );
  }
}
