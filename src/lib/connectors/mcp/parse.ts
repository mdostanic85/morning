import "server-only";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Normalise MCP tool results (structuredContent, JSON text, or raw objects). */
export function parseMcpToolPayload(result: unknown): unknown {
  if (result == null) return result;

  const record = asRecord(result);
  if (record?.structuredContent != null) {
    return record.structuredContent;
  }

  if (Array.isArray(result)) {
    const text = result
      .map((item) => {
        const row = asRecord(item);
        return row?.type === "text" && typeof row.text === "string" ? row.text : "";
      })
      .filter(Boolean)
      .join("\n");
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  }

  return result;
}
