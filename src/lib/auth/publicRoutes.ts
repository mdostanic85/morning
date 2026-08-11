/**
 * Paths that stay reachable without an app session.
 * Keep cron and Inngest public — they use their own secrets / signing keys.
 * Auth entry routes must stay public or the Google OAuth loop cannot complete.
 */
export const PUBLIC_ROUTE_PATTERNS = [
  "/about(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/google-data(.*)",
  "/data-deletion(.*)",
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

  if (path === "/about" || path.startsWith("/about/")) return true;
  if (path === "/privacy" || path.startsWith("/privacy/")) return true;
  if (path === "/terms" || path.startsWith("/terms/")) return true;
  if (path === "/google-data" || path.startsWith("/google-data/")) return true;
  if (path === "/data-deletion" || path.startsWith("/data-deletion/")) return true;
  if (path === "/sign-in" || path.startsWith("/sign-in/")) return true;
  if (path === "/sso-callback" || path.startsWith("/sso-callback/")) return true;
  if (path === "/api/cron" || path.startsWith("/api/cron/")) return true;
  if (path === "/api/inngest" || path.startsWith("/api/inngest/")) return true;

  return false;
}
