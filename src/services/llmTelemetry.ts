import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { llmTelemetry as llmTelemetryTable } from "@/db/tables";
import { execute } from "@/db/query";

export function hashLlmInput(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * $ per 1M tokens, input/output. Deliberately conservative and small — an
 * unknown model returns a null cost rather than a guessed one, so
 * `estimatedCostUsd` is never a silently wrong number.
 */
const MODEL_COST_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "claude-3-7-sonnet-latest": { input: 3.0, output: 15.0 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

export function estimateCostUsd(
  model: string,
  usage?: { inputTokens: number; outputTokens: number }
): number | null {
  if (!usage) return null;
  const pricing = MODEL_COST_PER_MILLION_TOKENS[model];
  if (!pricing) return null;
  return (
    (usage.inputTokens / 1_000_000) * pricing.input +
    (usage.outputTokens / 1_000_000) * pricing.output
  );
}

export interface LlmTelemetryEvent {
  jobType: string;
  provider: string;
  model: string;
  promptVersion?: string | null;
  inputHash: string;
  ok: boolean;
  errorKind?: string | null;
  fallback?: boolean;
  durationMs: number;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

/**
 * Persists one row per LLM/embedding call. Telemetry must never break the
 * job it's observing — failures are logged and swallowed, never thrown.
 */
export async function recordLlmTelemetry(event: LlmTelemetryEvent): Promise<void> {
  try {
    await execute(
      db.insert(llmTelemetryTable).values({
        jobType: event.jobType,
        provider: event.provider,
        model: event.model,
        promptVersion: event.promptVersion ?? null,
        inputHash: event.inputHash,
        ok: event.ok,
        errorKind: event.errorKind ?? null,
        fallback: event.fallback ?? false,
        durationMs: event.durationMs,
        inputTokens: event.usage?.inputTokens ?? null,
        outputTokens: event.usage?.outputTokens ?? null,
        totalTokens: event.usage?.totalTokens ?? null,
        estimatedCostUsd: estimateCostUsd(event.model, event.usage),
      })
    );
  } catch (err) {
    console.error(
      `[llm-telemetry] failed to record event: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }
}
