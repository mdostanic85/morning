import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { connectionSecrets as connectionSecretsTable } from "@/db/tables";
import { execute, fetchOne } from "@/db/query";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secretBox";
import { requireAppUserId } from "@/lib/auth/appUser";

// API keys stay out of any endpoint that returns raw values to the browser.
// Resolution order: environment variable first, then the encrypted DB blob
// (Settings page). A local `data/secrets.json` is only a legacy read fallback
// for pre-Postgres installs — writes always go to Postgres so hosted deploys
// (read-only filesystem) keep working.

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

/** Reserved `connection_secrets.provider` keys — not real connectors. */
const LLM_KEYS_BLOB = "llm.api_keys";
const LLM_SETTINGS_BLOB = "llm.settings";

const legacySecretsPath = path.join(process.cwd(), "data", "secrets.json");
const legacyLlmSettingsPath = path.join(process.cwd(), "data", "llm-settings.json");

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

async function readEncryptedBlob<T>(provider: string): Promise<T | null> {
  const userId = await requireAppUserId();
  const row = await fetchOne(
    db
      .select()
      .from(connectionSecretsTable)
      .where(
        and(
          eq(connectionSecretsTable.userId, userId),
          eq(connectionSecretsTable.provider, provider)
        )
      )
  );
  if (!row) return null;
  return JSON.parse(decryptSecret(row.ciphertext)) as T;
}

async function writeEncryptedBlob(provider: string, value: unknown): Promise<void> {
  const userId = await requireAppUserId();
  const ciphertext = encryptSecret(JSON.stringify(value));
  await execute(
    db
      .insert(connectionSecretsTable)
      .values({ userId, provider, ciphertext })
      .onConflictDoUpdate({
        target: [connectionSecretsTable.userId, connectionSecretsTable.provider],
        set: { ciphertext, updatedAt: new Date().toISOString() },
      })
  );
}

function readLegacyJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function readSecretsFile(): Promise<SecretsFile> {
  const fromDb = await readEncryptedBlob<SecretsFile>(LLM_KEYS_BLOB);
  if (fromDb) return fromDb;
  return readLegacyJsonFile<SecretsFile>(legacySecretsPath) ?? {};
}

async function writeSecretsFile(secrets: SecretsFile): Promise<void> {
  await writeEncryptedBlob(LLM_KEYS_BLOB, secrets);
}

async function readLlmSettingsFile(): Promise<LlmSettingsFile> {
  const fromDb = await readEncryptedBlob<LlmSettingsFile>(LLM_SETTINGS_BLOB);
  if (fromDb) return fromDb;
  return readLegacyJsonFile<LlmSettingsFile>(legacyLlmSettingsPath) ?? {};
}

async function writeLlmSettingsFile(settings: LlmSettingsFile): Promise<void> {
  await writeEncryptedBlob(LLM_SETTINGS_BLOB, settings);
}

async function disabledProviders(): Promise<Set<LlmProvider>> {
  const disabled = (await readLlmSettingsFile()).disabled ?? [];
  return new Set(disabled.filter((provider) => LLM_PROVIDERS.includes(provider)));
}

export async function isProviderEnabled(provider: LlmProvider): Promise<boolean> {
  return !(await disabledProviders()).has(provider);
}

export async function setProviderEnabled(provider: LlmProvider, enabled: boolean) {
  const settings = await readLlmSettingsFile();
  const disabled = new Set(
    (settings.disabled ?? []).filter((item) => LLM_PROVIDERS.includes(item))
  );
  if (enabled) {
    disabled.delete(provider);
  } else {
    disabled.add(provider);
  }
  settings.disabled = Array.from(disabled);
  await writeLlmSettingsFile(settings);
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
  /** When false, router skips this provider but the saved key stays stored. */
  enabled: boolean;
}

export async function getApiKeyStatuses(): Promise<ProviderKeyStatus[]> {
  const secrets = await readSecretsFile();
  const disabled = await disabledProviders();
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
  const settings = await readLlmSettingsFile();
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
  const settings = await readLlmSettingsFile();
  const secrets = await readSecretsFile();
  const envBaseUrl = process.env.LOCAL_LLM_BASE_URL?.trim();
  const envModel = process.env.LOCAL_LLM_MODEL?.trim();
  const envKey = process.env.LOCAL_LLM_API_KEY?.trim();
  const baseUrl = normalizeLocalBaseUrl(envBaseUrl || settings.local?.baseUrl || "");
  const model = (envModel || settings.local?.model || "").trim();
  const key = envKey || secrets.local || null;
  const source = envBaseUrl || envModel || envKey ? "env" : baseUrl || model || key ? "settings" : null;
  const disabled = await disabledProviders();

  return {
    provider: "local",
    configured: Boolean(baseUrl && model),
    enabled: Boolean(baseUrl && model) && !disabled.has("local"),
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

  const settings = await readLlmSettingsFile();
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
  await writeLlmSettingsFile(settings);

  if (input.apiKey?.trim()) {
    await saveApiKey("local", input.apiKey);
  }
}

export async function clearLocalLlmConfig(): Promise<void> {
  const settings = await readLlmSettingsFile();
  delete settings.local;
  await writeLlmSettingsFile(settings);
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
  const secrets = await readSecretsFile();
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
  const secrets = await readSecretsFile();
  secrets[provider] = key.trim();
  await writeSecretsFile(secrets);
}

export async function clearApiKey(provider: LlmProvider) {
  const secrets = await readSecretsFile();
  delete secrets[provider];
  await writeSecretsFile(secrets);
}
