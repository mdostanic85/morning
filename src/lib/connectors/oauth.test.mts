import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRedirectUri,
  CALENDAR_SCOPES,
  DRIVE_SCOPES,
  GMAIL_SCOPES,
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
});
