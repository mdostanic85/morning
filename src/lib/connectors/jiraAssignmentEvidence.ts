export interface JiraAssignmentChangeEvidence {
  assignmentChangedAt: string;
  previousAssignee: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function samePerson(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Returns the newest changelog entry that assigned the issue to its current
 * assignee. Jira's issue `updated` timestamp is deliberately not used here:
 * comments and unrelated field edits move it too.
 */
export function assignmentEvidenceFromJiraChangelog(
  changelog: unknown,
  currentAssignee?: string | null
): JiraAssignmentChangeEvidence | null {
  const record = asRecord(changelog);
  const histories = Array.isArray(record?.histories)
    ? record.histories
    : Array.isArray(record?.values)
      ? record.values
      : [];

  const changes = histories.flatMap((rawHistory) => {
    const history = asRecord(rawHistory);
    if (!history || typeof history.created !== "string" || !Array.isArray(history.items)) {
      return [];
    }
    return history.items.flatMap((rawItem) => {
      const item = asRecord(rawItem);
      if (!item || String(item.field ?? "").toLowerCase() !== "assignee") return [];
      const nextAssignee =
        typeof item["toString"] === "string" ? item["toString"] : null;
      if (
        currentAssignee &&
        (!nextAssignee || !samePerson(nextAssignee, currentAssignee))
      ) {
        return [];
      }
      return [{
        assignmentChangedAt: history.created as string,
        previousAssignee:
          typeof item["fromString"] === "string" && item["fromString"].trim()
            ? item["fromString"]
            : null,
      }];
    });
  });

  return changes.sort(
    (left, right) =>
      Date.parse(right.assignmentChangedAt) - Date.parse(left.assignmentChangedAt)
  )[0] ?? null;
}

/**
 * Transport-neutral fallback for syncs where Jira did not return a changelog.
 * It only records a handover when the app has actually observed a different
 * prior assignee, so a comment on already-owned work cannot manufacture one.
 */
export function assignmentEvidenceFromObservedAssignees(input: {
  previousAssignee: unknown;
  currentAssignee: unknown;
  observedAt: string;
}): JiraAssignmentChangeEvidence | null {
  if (
    typeof input.currentAssignee !== "string" ||
    !input.currentAssignee.trim() ||
    typeof input.previousAssignee !== "string" ||
    !input.previousAssignee.trim() ||
    samePerson(input.previousAssignee, input.currentAssignee)
  ) {
    return null;
  }
  return {
    assignmentChangedAt: input.observedAt,
    previousAssignee: input.previousAssignee,
  };
}
