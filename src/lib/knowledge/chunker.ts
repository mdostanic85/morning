export interface TextChunk {
  index: number;
  text: string;
}

export interface ChunkTextOptions {
  maxChars?: number;
  overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 180;

function splitLongPart(part: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = part.trim();

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    const splitAt = Math.max(window.lastIndexOf(" "), Math.floor(maxChars * 0.75));
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitIntoParts(text: string, maxChars: number): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .flatMap((part) => splitLongPart(part, maxChars))
    .map((part) => part.trim())
    .filter(Boolean);
}

export function chunkTextSafely(text: string, options: ChunkTextOptions = {}): TextChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = Math.min(options.overlapChars ?? DEFAULT_OVERLAP_CHARS, maxChars - 1);
  const parts = splitIntoParts(text, maxChars);
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const next = current ? `${current}\n\n${part}` : part;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    const overlap = current.slice(-overlapChars).trim();
    current = overlap ? `${overlap}\n\n${part}` : part;

    if (current.length > maxChars) {
      chunks.push(...splitLongPart(current, maxChars));
      current = "";
    }
  }

  if (current) chunks.push(current);

  return chunks.map((chunk, index) => ({ index, text: chunk }));
}
