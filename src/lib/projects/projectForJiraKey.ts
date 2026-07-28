/**
 * Most-specific-project-wins resolver for a Jira project key.
 *
 * Problem: the Hydra umbrella project (project 18) claims every child board's
 * key in addition to each dedicated per-key project.  A plain `Array.find`
 * returns whichever row happens to come first from the DB — which is
 * nondeterministic and may return the umbrella, causing the sync loop to
 * rename the umbrella to the child project name and then duplicate it.
 *
 * Resolution rule (deterministic):
 *   1. Prefer the project with the fewest `jiraKeys` — that is the most
 *      specific assignment.  A project with exactly one key is more specific
 *      than the umbrella that lists nine.
 *   2. Break ties by the lowest `id` (creation order) so the result is
 *      always the same regardless of the order rows were loaded.
 */

import type { Project } from "@/domain/project";

/**
 * Returns the most-specific project that claims `key`, or `null` when no
 * project claims it at all.
 *
 * "Most specific" = fewest total `jiraKeys`; ties broken by lowest `id`.
 */
export function projectForJiraKey(
  projects: readonly Pick<Project, "id" | "jiraKeys" | "name" | "status">[],
  key: string
): Pick<Project, "id" | "jiraKeys" | "name" | "status"> | null {
  const upper = key.toUpperCase();
  const candidates = projects.filter((project) =>
    project.jiraKeys.some((k) => k.toUpperCase() === upper)
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    if (current.jiraKeys.length < best.jiraKeys.length) return current;
    if (current.jiraKeys.length === best.jiraKeys.length && current.id < best.id) return current;
    return best;
  });
}

/**
 * Convenience helper used by `isSourceFromInactiveProject`: returns the
 * status of the most specific project that claims `key`, or `null` when no
 * project claims it.
 */
export function projectStatusForJiraKey(
  projects: readonly Pick<Project, "id" | "jiraKeys" | "name" | "status">[],
  key: string
): Project["status"] | null {
  return projectForJiraKey(projects, key)?.status ?? null;
}
