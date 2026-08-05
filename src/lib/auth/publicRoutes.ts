/**
 * Paths that stay reachable without an app session.
 * Keep cron and Inngest public — they use their own secrets / signing keys.
 * Auth entry routes must stay public or the Google OAuth loop cannot complete.
 */
export const PUBLIC_ROUTE_PATTERNS = [
  "/sign-in(.*)",
  "/sso-callback(.*)",
  "/api/cron/(.*)",
  "/api/inngest(.*)",
] as const;

/**
 * Pure path check for tests and tooling. Mirrors Clerk `createRouteMatcher`
 * intent for the patterns above (not a full path-to-regexp implementation).
 */
export function isPublicPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";

  if (path === "/sign-in" || path.startsWith("/sign-in/")) return true;
  if (path === "/sso-callback" || path.startsWith("/sso-callback/")) return true;
  if (path === "/api/cron" || path.startsWith("/api/cron/")) return true;
  if (path === "/api/inngest" || path.startsWith("/api/inngest/")) return true;

  return false;
}
