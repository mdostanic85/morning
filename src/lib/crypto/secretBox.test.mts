import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { decryptSecret, encryptSecret } from "./secretBox";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

let originalKey: string | undefined;

beforeEach(() => {
  originalKey = process.env.SECRETS_ENCRYPTION_KEY;
  process.env.SECRETS_ENCRYPTION_KEY = KEY_A;
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.SECRETS_ENCRYPTION_KEY;
  } else {
    process.env.SECRETS_ENCRYPTION_KEY = originalKey;
  }
});

// Connector tokens are stored in PostgreSQL, so the database alone must never
// be enough to read a live Jira/Gmail/GitHub credential.
describe("secretBox", () => {
  it("round-trips a secret payload", () => {
    const payload = JSON.stringify({ accessToken: "ya29.a0Af", refreshToken: "1//0gLd" });
    assert.equal(decryptSecret(encryptSecret(payload)), payload);
  });

  it("never emits the plaintext in the stored value", () => {
    const sealed = encryptSecret("ghp_supersecrettoken");
    assert.ok(!sealed.includes("ghp_supersecrettoken"));
  });

  it("produces a different ciphertext each time for the same input", () => {
    assert.notEqual(encryptSecret("same-token"), encryptSecret("same-token"));
  });

  it("accepts a hex-encoded key", () => {
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    assert.equal(decryptSecret(encryptSecret("token")), "token");
  });

  it("rejects a payload sealed with a different key", () => {
    const sealed = encryptSecret("token");
    process.env.SECRETS_ENCRYPTION_KEY = KEY_B;
    assert.throws(() => decryptSecret(sealed), /failed authentication/);
  });

  it("rejects a tampered ciphertext", () => {
    const [version, iv, tag, ciphertext] = encryptSecret("token").split(".");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 0xff;
    assert.throws(
      () => decryptSecret([version, iv, tag, flipped.toString("base64")].join(".")),
      /failed authentication/
    );
  });

  it("rejects a value that is not in the encrypted format", () => {
    assert.throws(() => decryptSecret("plain-token"), /expected encrypted format/);
  });

  it("explains how to fix a missing key", () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;
    assert.throws(() => encryptSecret("token"), /SECRETS_ENCRYPTION_KEY is not set/);
  });

  it("rejects a key of the wrong length", () => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    assert.throws(() => encryptSecret("token"), /must decode to exactly 32 bytes/);
  });
});
