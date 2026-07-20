export const CONNECTION_PROVIDERS = [
  "gmail",
  "calendar",
  "drive",
  "jira",
  "confluence",
  "granola",
  "github",
  "discord",
  "figma",
] as const;

export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number];

export function isConnectionProvider(value: unknown): value is ConnectionProvider {
  return (
    typeof value === "string" &&
    (CONNECTION_PROVIDERS as readonly string[]).includes(value)
  );
}

export function isOAuthProvider(
  value: ConnectionProvider
): value is "gmail" | "calendar" | "drive" | "jira" | "confluence" | "discord" | "github" {
  return (
    value === "gmail" ||
    value === "calendar" ||
    value === "drive" ||
    value === "jira" ||
    value === "confluence" ||
    value === "discord" ||
    value === "github"
  );
}
