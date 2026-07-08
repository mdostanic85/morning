import "server-only";
import fs from "node:fs";
import path from "node:path";

// API keys are intentionally kept out of the SQLite `settings` table and out
// of any endpoint that returns raw values to the browser. They live in their
// own local, gitignored file and are only ever exposed to the client as a
// masked preview.
//
// Resolution order (also relied on by the LLM router): environment variable
// first, then the local secrets file saved from the Settings page.

export const LLM_PROVIDERS = ["openai", "anthropic"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const ENV_VAR_NAME: Record<LlmProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

const secretsPath = path.join(process.cwd(), "data", "secrets.json");

type SecretsFile = Partial<Record<LlmProvider, string>>;

function readSecretsFile(): SecretsFile {
  if (!fs.existsSync(secretsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
  } catch {
    return {};
  }
}

function writeSecretsFile(secrets: SecretsFile) {
  const dir = path.dirname(secretsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), {
    mode: 0o600,
  });
}

function mask(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export interface ProviderKeyStatus {
  provider: LlmProvider;
  configured: boolean;
  maskedKey: string | null;
  /** True when the key comes from an environment variable rather than the Settings page. */
  source: "env" | "settings" | null;
}

export async function getApiKeyStatuses(): Promise<ProviderKeyStatus[]> {
  const secrets = readSecretsFile();
  return LLM_PROVIDERS.map((provider) => {
    const envKey = process.env[ENV_VAR_NAME[provider]];
    const savedKey = secrets[provider];
    const key = envKey || savedKey;
    return {
      provider,
      configured: Boolean(key),
      maskedKey: key ? mask(key) : null,
      source: envKey ? "env" : savedKey ? "settings" : null,
    };
  });
}

/**
 * Resolves the actual key value for internal, server-side use only (e.g. the
 * LLM router). Never return this from an API route — the client only ever
 * sees `getApiKeyStatuses()`'s masked output.
 */
export async function getRawApiKey(provider: LlmProvider): Promise<string | null> {
  const envKey = process.env[ENV_VAR_NAME[provider]];
  if (envKey) return envKey;
  const secrets = readSecretsFile();
  return secrets[provider] ?? null;
}

export async function saveApiKey(provider: LlmProvider, key: string) {
  const secrets = readSecretsFile();
  secrets[provider] = key.trim();
  writeSecretsFile(secrets);
}

export async function clearApiKey(provider: LlmProvider) {
  const secrets = readSecretsFile();
  delete secrets[provider];
  writeSecretsFile(secrets);
}
