import "server-only";
import fs from "node:fs";
import path from "node:path";

export interface ConnectionSecret {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  apiKey?: string;
  pat?: string;
  botToken?: string;
}

type ConnectionSecretFile = Record<string, ConnectionSecret>;

const secretsPath = path.join(process.cwd(), "data", "connection-secrets.json");

function readSecretsFile(): ConnectionSecretFile {
  if (!fs.existsSync(secretsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(secretsPath, "utf-8")) as ConnectionSecretFile;
  } catch {
    return {};
  }
}

function writeSecretsFile(secrets: ConnectionSecretFile) {
  const dir = path.dirname(secretsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
}

export async function getConnectionSecret(provider: string): Promise<ConnectionSecret | null> {
  return readSecretsFile()[provider] ?? null;
}

export async function saveConnectionSecret(provider: string, secret: ConnectionSecret) {
  const secrets = readSecretsFile();
  secrets[provider] = { ...(secrets[provider] ?? {}), ...secret };
  writeSecretsFile(secrets);
}

export async function clearConnectionSecret(provider: string) {
  const secrets = readSecretsFile();
  delete secrets[provider];
  writeSecretsFile(secrets);
}
