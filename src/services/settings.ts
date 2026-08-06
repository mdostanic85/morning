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

export const CLOUD_LLM_PROVIDERS = ["groq", "openai", "anthropic", "gemini"] as const;
export type CloudLlmProvider = (typeof CLOUD_LLM_PROVIDERS)[number];
export const LLM_PROVIDERS = [...CLOUD_LLM_PROVIDERS, "local"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const ENV_VAR_NAME: Record<LlmProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
  // "google" already means the Gmail/Calendar/Drive OAuth connection in this
  // app, so the LLM provider is keyed as `gemini` — the env var still follows
  // Google's own naming.
  gemini: "GOOGLE_API_KEY",
  local: "LOCAL_LLM_API_KEY",
};

const secretsPath = path.join(process.cwd(), "data", "secrets.json");
const llmSettingsPath = path.join(process.cwd(), "data", "llm-settings.json");

type SecretsFile = Partial<Record<LlmProvider, string>>;
type LlmSettingsFile = {
  disabled?: LlmProvider[];
  local?: {
    baseUrl?: string;
    model?: string;
  };
};

export interface LocalLlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface LocalLlmStatus {
  provider: "local";
  configured: boolean;
  enabled: boolean;
  baseUrl: string;
  model: string;
  maskedKey: string | null;
  source: "env" | "settings" | null;
}

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

function readLlmSettingsFile(): LlmSettingsFile {
  if (!fs.existsSync(llmSettingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(llmSettingsPath, "utf-8")) as LlmSettingsFile;
  } catch {
    return {};
  }
}

function writeLlmSettingsFile(settings: LlmSettingsFile) {
  const dir = path.dirname(llmSettingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(llmSettingsPath, JSON.stringify(settings, null, 2), {
    mode: 0o600,
  });
}

function disabledProviders(): Set<LlmProvider> {
  const disabled = readLlmSettingsFile().disabled ?? [];
  return new Set(disabled.filter((provider) => LLM_PROVIDERS.includes(provider)));
}

export async function isProviderEnabled(provider: LlmProvider): Promise<boolean> {
  return !disabledProviders().has(provider);
}

export async function setProviderEnabled(provider: LlmProvider, enabled: boolean) {
  const settings = readLlmSettingsFile();
  const disabled = new Set(
    (settings.disabled ?? []).filter((item) => LLM_PROVIDERS.includes(item))
  );
  if (enabled) {
    disabled.delete(provider);
  } else {
    disabled.add(provider);
  }
  settings.disabled = Array.from(disabled);
  writeLlmSettingsFile(settings);
}

function mask(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export interface ProviderKeyStatus {
  provider: CloudLlmProvider;
  configured: boolean;
  maskedKey: string | null;
  /** True when the key comes from an environment variable rather than the Settings page. */
  source: "env" | "settings" | null;
  /** When false, router skips this provider but the saved key stays on disk. */
  enabled: boolean;
}

export async function getApiKeyStatuses(): Promise<ProviderKeyStatus[]> {
  const secrets = readSecretsFile();
  const disabled = disabledProviders();
  return CLOUD_LLM_PROVIDERS.map((provider) => {
    const envKey = process.env[ENV_VAR_NAME[provider]];
    const savedKey = secrets[provider];
    const key = envKey || savedKey;
    return {
      provider,
      configured: Boolean(key),
      maskedKey: key ? mask(key) : null,
      source: envKey ? "env" : savedKey ? "settings" : null,
      enabled: !disabled.has(provider),
    };
  });
}

function normalizeLocalBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** Local chat configuration. Environment values take precedence over Settings. */
export async function getLocalLlmConfig(): Promise<LocalLlmConfig | null> {
  const settings = readLlmSettingsFile();
  const envBaseUrl = process.env.LOCAL_LLM_BASE_URL?.trim();
  const envModel = process.env.LOCAL_LLM_MODEL?.trim();
  const baseUrl = normalizeLocalBaseUrl(envBaseUrl || settings.local?.baseUrl || "");
  const model = (envModel || settings.local?.model || "").trim();
  if (!baseUrl || !model) return null;

  return {
    baseUrl,
    model,
    // OpenAI-compatible local servers commonly ignore Authorization, but the
    // shared client always sends it. A harmless placeholder keeps both secured
    // and unsecured endpoints on the same adapter.
    apiKey: (await getRawApiKey("local")) || "local",
  };
}

export async function getLocalLlmStatus(): Promise<LocalLlmStatus> {
  const settings = readLlmSettingsFile();
  const secrets = readSecretsFile();
  const envBaseUrl = process.env.LOCAL_LLM_BASE_URL?.trim();
  const envModel = process.env.LOCAL_LLM_MODEL?.trim();
  const envKey = process.env.LOCAL_LLM_API_KEY?.trim();
  const baseUrl = normalizeLocalBaseUrl(envBaseUrl || settings.local?.baseUrl || "");
  const model = (envModel || settings.local?.model || "").trim();
  const key = envKey || secrets.local || null;
  const source = envBaseUrl || envModel || envKey ? "env" : baseUrl || model || key ? "settings" : null;

  return {
    provider: "local",
    configured: Boolean(baseUrl && model),
    enabled: Boolean(baseUrl && model) && !disabledProviders().has("local"),
    baseUrl,
    model,
    maskedKey: key ? mask(key) : null,
    source,
  };
}

export async function saveLocalLlmConfig(input: {
  baseUrl: string;
  model: string;
  apiKey?: string | null;
}): Promise<void> {
  const parsedUrl = new URL(input.baseUrl.trim());
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Local LLM URL must use http or https.");
  }
  const model = input.model.trim();
  if (!model) throw new Error("Local LLM model is required.");

  const settings = readLlmSettingsFile();
  const wasConfigured = Boolean(settings.local?.baseUrl && settings.local?.model);
  settings.local = {
    baseUrl: normalizeLocalBaseUrl(parsedUrl.toString()),
    model,
  };
  // A newly saved local endpoint stays paused until the user explicitly
  // activates it. Subsequent edits preserve the existing enabled state.
  if (!wasConfigured && !(settings.disabled ?? []).includes("local")) {
    settings.disabled = [...(settings.disabled ?? []), "local"];
  }
  writeLlmSettingsFile(settings);

  if (input.apiKey?.trim()) {
    await saveApiKey("local", input.apiKey);
  }
}

export async function clearLocalLlmConfig(): Promise<void> {
  const settings = readLlmSettingsFile();
  delete settings.local;
  writeLlmSettingsFile(settings);
  await clearApiKey("local");
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

/** Key only when provider enabled — router uses this, not getRawApiKey. */
export async function getAvailableApiKey(provider: LlmProvider): Promise<string | null> {
  if (!(await isProviderEnabled(provider))) return null;
  if (provider === "local") {
    const config = await getLocalLlmConfig();
    return config?.apiKey ?? null;
  }
  return getRawApiKey(provider);
}

/** Providers that are enabled and have a key — router only uses these. */
export async function getActiveProviders(): Promise<LlmProvider[]> {
  const active: LlmProvider[] = [];
  for (const provider of LLM_PROVIDERS) {
    if (await getAvailableApiKey(provider)) active.push(provider);
  }
  return active;
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
