import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRedirectUri,
  CALENDAR_SCOPES,
  DRIVE_SCOPES,
  GMAIL_SCOPES,
  getOAuthConfig,
  scopesGrantedForProvider,
} from "./oauth";

describe("Google OAuth scope handling", () => {
  it("uses one stable callback for every Google integration", () => {
    const origin = "https://morning.example";
    assert.equal(
      buildRedirectUri(origin, "gmail"),
      "https://morning.example/api/connections/gmail/callback"
    );
    assert.equal(buildRedirectUri(origin, "calendar"), buildRedirectUri(origin, "gmail"));
    assert.equal(buildRedirectUri(origin, "drive"), buildRedirectUri(origin, "gmail"));
  });

  it("does not treat a partially granted Google consent as full access", () => {
    const gmailOnly = [...GMAIL_SCOPES];
    assert.deepEqual(scopesGrantedForProvider("gmail", gmailOnly), gmailOnly);
    assert.deepEqual(scopesGrantedForProvider("calendar", gmailOnly), []);
    assert.deepEqual(scopesGrantedForProvider("drive", gmailOnly), []);
  });

  it("maps each source only to its own read-only scope", () => {
    const all = [...GMAIL_SCOPES, ...CALENDAR_SCOPES, ...DRIVE_SCOPES];
    assert.deepEqual(scopesGrantedForProvider("gmail", all), [...GMAIL_SCOPES]);
    assert.deepEqual(scopesGrantedForProvider("calendar", all), [...CALENDAR_SCOPES]);
    assert.deepEqual(scopesGrantedForProvider("drive", all), [...DRIVE_SCOPES]);
  });

  it("asks Google to show the account chooser before consent", () => {
    for (const provider of ["gmail", "calendar", "drive"] as const) {
      assert.equal(
        getOAuthConfig(provider)?.extraAuthParams?.prompt,
        "consent select_account"
      );
    }
  });

  it("does not reuse the Google sign-in client in production", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalIntegrationClientId = process.env.GOOGLE_INTEGRATIONS_CLIENT_ID;
    const originalLegacyClientId = process.env.GOOGLE_CLIENT_ID;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.GOOGLE_INTEGRATIONS_CLIENT_ID;
      process.env.GOOGLE_CLIENT_ID = "sign-in-client";

      assert.equal(getOAuthConfig("gmail")?.clientId, "");
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalIntegrationClientId === undefined) {
        delete process.env.GOOGLE_INTEGRATIONS_CLIENT_ID;
      } else {
        process.env.GOOGLE_INTEGRATIONS_CLIENT_ID = originalIntegrationClientId;
      }
      if (originalLegacyClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = originalLegacyClientId;
    }
  });
});
