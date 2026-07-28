/**
 * Discovers the full set of Figma file keys that should be synced, merging:
 *  1. Keys configured explicitly on projects (`project.figmaFileKeys`)
 *  2. Keys found inside Jira/meeting source item bodies and URLs
 *
 * Returns a map from file key to the project IDs that "claim" it.
 * A file key claimed by exactly one project inherits that projectId;
 * one claimed by multiple projects (or none) gets null so the pipeline's
 * LLM project matcher can resolve it.
 */

import type { SourceItem } from "@/domain/sourceItem";
import type { Project } from "@/domain/project";
import { extractAllFigmaFileKeys } from "@/lib/connectors/figmaUrl";

/** Source types that may embed Figma URLs in their bodies or URLs. */
const DISCOVERY_SOURCE_TYPES = new Set([
  "jira",
  "confluence",
  "granola",
  "gmail",
  "drive",
  "manual_transcript",
]);

export interface FigmaFileDiscovery {
  /** All unique file keys to sync. */
  fileKeys: string[];
  /** Unambiguous project assignment per file key (null when 0 or 2+ projects claim it). */
  projectIdByFileKey: Map<string, number | null>;
}

function resolveFileKeyFromRaw(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // If it looks like a URL, pull the key out; otherwise treat it as a raw key.
  if (trimmed.includes("figma.com")) {
    const match = trimmed.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]{10,})/);
    return match?.[1] ?? null;
  }
  // Raw key: alphanumeric, at least 10 chars.
  if (/^[a-zA-Z0-9]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

export function discoverFigmaFileKeys(input: {
  projects: Pick<Project, "id" | "figmaFileKeys">[];
  sourceItems: Pick<SourceItem, "projectId" | "sourceType" | "body" | "url" | "title">[];
}): FigmaFileDiscovery {
  // project id → set of file keys it explicitly configures
  const projectToConfiguredKeys = new Map<number, Set<string>>();
  for (const project of input.projects) {
    const keys = new Set<string>();
    for (const raw of project.figmaFileKeys) {
      const key = resolveFileKeyFromRaw(raw);
      if (key) keys.add(key);
    }
    if (keys.size > 0) projectToConfiguredKeys.set(project.id, keys);
  }

  // file key → set of project ids that claim it (configured or discovered)
  const keyToProjects = new Map<string, Set<number>>();

  // 1. Configured keys — each is claimed by its owning project.
  for (const [projectId, keys] of projectToConfiguredKeys) {
    for (const key of keys) {
      if (!keyToProjects.has(key)) keyToProjects.set(key, new Set());
      keyToProjects.get(key)!.add(projectId);
    }
  }

  // Build a map from Jira project key prefix (e.g. "UATL") → project id for
  // deterministic inheritance when a Jira source mentions a Figma URL.
  const jiraPrefixToProject = new Map<string, number>();
  for (const project of input.projects) {
    for (const jiraKey of (project as { jiraKeys?: string[] }).jiraKeys ?? []) {
      const prefix = jiraKey.toUpperCase().split("-")[0];
      if (prefix) jiraPrefixToProject.set(prefix, project.id);
    }
  }

  // 2. Discovered keys from source items.
  const discoveryItems = input.sourceItems.filter((item) =>
    DISCOVERY_SOURCE_TYPES.has(item.sourceType)
  );

  for (const item of discoveryItems) {
    const texts = [item.body ?? "", item.url ?? "", item.title ?? ""].filter(Boolean);
    const discovered = extractAllFigmaFileKeys(texts);

    for (const key of discovered) {
      // Skip keys already fully covered by configuration.
      if (!keyToProjects.has(key)) keyToProjects.set(key, new Set());
      const claimSet = keyToProjects.get(key)!;

      // Inherit from source's projectId when available.
      if (item.projectId != null) {
        claimSet.add(item.projectId);
      } else if (item.sourceType === "jira") {
        // Try to infer project from the Jira key prefix in the body.
        const jiraKeys = item.body.toUpperCase().match(/\b([A-Z][A-Z0-9]+)-\d+\b/g) ?? [];
        for (const jiraKey of jiraKeys) {
          const prefix = jiraKey.split("-")[0];
          const pid = prefix ? jiraPrefixToProject.get(prefix) : undefined;
          if (pid != null) {
            claimSet.add(pid);
            break;
          }
        }
      }
    }
  }

  const fileKeys = Array.from(keyToProjects.keys());
  const projectIdByFileKey = new Map<string, number | null>();
  for (const [key, claimSet] of keyToProjects) {
    projectIdByFileKey.set(key, claimSet.size === 1 ? [...claimSet][0]! : null);
  }

  return { fileKeys, projectIdByFileKey };
}
