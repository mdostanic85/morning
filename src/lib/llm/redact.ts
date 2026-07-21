/**
 * Pre-LLM secret redaction (WL-11). Applied inside `wrapUntrustedContent`
 * (see `prompts/shared.ts`) so every untrusted body/diff/quote sent to any
 * provider through the central router is scrubbed at one single point —
 * no per-job wiring required, and no call site can accidentally skip it.
 *
 * Conservative by design: prefers over-redacting borderline matches to
 * leaking a live credential into a model provider's logs (ai-safety.mdc).
 */

interface SecretPattern {
  name: string;
  pattern: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: "private_key_block", pattern: /-----BEGIN[ A-Z]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z]*PRIVATE KEY-----/g },
  { name: "aws_access_key_id", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "openai_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9\-_.]{20,}\b/gi },
  {
    name: "connection_string_with_credentials",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]+@[^\s]+/gi,
  },
  {
    name: "assignment_style_secret",
    pattern:
      /\b(?:api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|pwd)\s*[:=]\s*["']?[A-Za-z0-9/+._-]{10,}["']?/gi,
  },
];

export interface RedactionResult {
  text: string;
  redactedCount: number;
  redactedKinds: string[];
}

/**
 * Replaces likely credential/secret substrings with a fixed `[REDACTED]`
 * placeholder. Pure and synchronous — safe to call on every prompt build.
 */
export function redactSecrets(text: string): RedactionResult {
  let redactedCount = 0;
  const redactedKinds = new Set<string>();
  let result = text;
  for (const { name, pattern } of SECRET_PATTERNS) {
    result = result.replace(pattern, () => {
      redactedCount += 1;
      redactedKinds.add(name);
      return "[REDACTED]";
    });
  }
  return { text: result, redactedCount, redactedKinds: Array.from(redactedKinds) };
}
