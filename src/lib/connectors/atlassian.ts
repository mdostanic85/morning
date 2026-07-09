import "server-only";
import { bearerFetch } from "./auth";

export interface AtlassianResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl?: string;
}

export async function getAtlassianResources(provider: "jira" | "confluence") {
  const response = await bearerFetch(
    provider,
    "https://api.atlassian.com/oauth/token/accessible-resources"
  );
  const resources = (await response.json()) as AtlassianResource[] | { error?: string };
  if (!response.ok || !Array.isArray(resources)) {
    throw new Error("Could not list Atlassian sites.");
  }
  return resources;
}

export async function getDefaultAtlassianResource(provider: "jira" | "confluence") {
  const resources = await getAtlassianResources(provider);
  const resource = resources[0];
  if (!resource) throw new Error("No Atlassian sites are available for this connection.");
  return resource;
}
