import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { githubRepoCursorKey, discordChannelCursorKey } from "./connectionCursorUtils";

describe("resource-scoped connection cursors", () => {
  it("scopes github cursors per repository", () => {
    const key = githubRepoCursorKey(1, "owner/repo");
    assert.equal(key.scopeType, "resource");
    assert.equal(key.scopeKey, "owner/repo");
    assert.equal(key.cursorType, "github_repo_prs");
  });

  it("scopes discord cursors per channel", () => {
    const key = discordChannelCursorKey(1, "1234567890");
    assert.equal(key.scopeType, "resource");
    assert.equal(key.scopeKey, "1234567890");
    assert.equal(key.cursorType, "discord_channel_messages");
  });
});
