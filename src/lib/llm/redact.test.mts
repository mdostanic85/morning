import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("redacts an AWS access key id", () => {
    const result = redactSecrets("export AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP");
    assert.equal(result.redactedCount, 1);
    assert.ok(!result.text.includes("AKIAABCDEFGHIJKLMNOP"));
    assert.ok(result.text.includes("[REDACTED]"));
  });

  it("redacts a GitHub PAT", () => {
    const result = redactSecrets(
      "use token ghp_1234567890abcdefghijklmnopqrstuvwxyz12 to clone"
    );
    assert.equal(result.redactedCount, 1);
    assert.ok(result.redactedKinds.includes("github_token"));
  });

  it("redacts an OpenAI-style key", () => {
    const result = redactSecrets("OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456");
    assert.equal(result.redactedCount, 1);
  });

  it("redacts a Postgres connection string with embedded credentials", () => {
    const result = redactSecrets(
      "DATABASE_URL=postgresql://worklight:s3cr3tpass@127.0.0.1:5433/worklight"
    );
    assert.equal(result.redactedCount, 1);
    assert.ok(!result.text.includes("s3cr3tpass"));
  });

  it("redacts a generic key=value secret assignment", () => {
    const result = redactSecrets('client_secret: "abcdEFGH12345678"');
    assert.equal(result.redactedCount, 1);
  });

  it("redacts a private key block", () => {
    const block = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIBOgIBAAJBAK...",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const result = redactSecrets(`Here is the key:\n${block}`);
    assert.equal(result.redactedCount, 1);
    assert.ok(!result.text.includes("MIIBOgIBAAJBAK"));
  });

  it("leaves ordinary transcript text untouched", () => {
    const text =
      "Matt said we should ship the Canvas file manager change by Friday and update the PRD.";
    const result = redactSecrets(text);
    assert.equal(result.redactedCount, 0);
    assert.equal(result.text, text);
  });

  it("redacts multiple distinct secrets in one body", () => {
    const text = [
      "api_key: abcdefghijklmnop123456",
      "and also ghp_1234567890abcdefghijklmnopqrstuvwxyz12",
    ].join("\n");
    const result = redactSecrets(text);
    assert.ok(result.redactedCount >= 2);
  });
});
