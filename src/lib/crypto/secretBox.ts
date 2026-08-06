import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Connector tokens are stored in PostgreSQL rather than on disk, because a
// hosted deploy has no writable, persistent filesystem. The database is
// therefore no longer allowed to be the only thing standing between a leaked
// dump and a live Jira/Gmail/GitHub token, so every value is sealed here first.

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT_VERSION = "v1";

const KEY_ENV_VAR = "SECRETS_ENCRYPTION_KEY";

const KEY_HELP =
  `Set ${KEY_ENV_VAR} to a 32-byte key, base64 or hex encoded. Generate one with ` +
  `\`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"\`, ` +
  "then add it to .env.local and to the Vercel project environment. " +
  "Rotating this key makes every stored connector token unreadable — reconnect each provider after a rotation.";

function decodeKey(raw: string): Buffer {
  const value = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex");

  const decoded = Buffer.from(value, "base64");
  if (decoded.length === KEY_BYTES) return decoded;

  throw new Error(
    `${KEY_ENV_VAR} must decode to exactly ${KEY_BYTES} bytes (got ${decoded.length}). ${KEY_HELP}`
  );
}

function encryptionKey(): Buffer {
  const raw = process.env[KEY_ENV_VAR];
  if (!raw?.trim()) {
    throw new Error(`${KEY_ENV_VAR} is not set, so connector secrets cannot be read or written. ${KEY_HELP}`);
  }
  return decodeKey(raw);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, ciphertextPart] = payload.split(".");
  if (version !== FORMAT_VERSION || !ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Stored secret is not in the expected encrypted format.");
  }

  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Stored secret has a malformed nonce or authentication tag.");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      `Stored secret failed authentication — it was almost certainly encrypted with a different ${KEY_ENV_VAR}. ` +
        "Reconnect the provider to store it again under the current key."
    );
  }
}
