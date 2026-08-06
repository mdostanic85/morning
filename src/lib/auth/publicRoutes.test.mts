import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPublicPath,
  PUBLIC_ROUTE_PATTERNS,
} from "./publicRoutes";

describe("public auth routes", () => {
  it("lists the routes that must stay public for OAuth and workers", () => {
    assert.deepEqual([...PUBLIC_ROUTE_PATTERNS], [
      "/sign-in(.*)",
      "/sso-callback(.*)",
      "/api/cron/(.*)",
      "/api/inngest(.*)",
    ]);
  });

  it("treats sign-in and SSO callback as public", () => {
    assert.equal(isPublicPath("/sign-in"), true);
    assert.equal(isPublicPath("/sign-in/"), true);
    assert.equal(isPublicPath("/sso-callback"), true);
    assert.equal(isPublicPath("/sso-callback?x=1"), true);
  });

  it("treats cron and Inngest as public", () => {
    assert.equal(isPublicPath("/api/cron/hydra"), true);
    assert.equal(isPublicPath("/api/inngest"), true);
  });

  it("protects app pages and most APIs", () => {
    assert.equal(isPublicPath("/"), false);
    assert.equal(isPublicPath("/settings"), false);
    assert.equal(isPublicPath("/api/profile"), false);
    assert.equal(isPublicPath("/api/connections/gmail/connect"), false);
  });
});
