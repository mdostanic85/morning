export function extractJiraKeyFromTitle(title: string): string | null {
  return title.match(/^([A-Z][A-Z0-9]+-\d+)\b/)?.[1] ?? null;
}

export function findTaskIdByJiraKey(
  tasks: { id: number; title: string }[],
  jiraKey: string | null | undefined
): number | null {
  if (!jiraKey) return null;
  const key = jiraKey.toUpperCase();
  const match = tasks.find((task) => {
    const fromTitle = extractJiraKeyFromTitle(task.title);
    if (fromTitle?.toUpperCase() === key) return true;
    return task.title.toUpperCase().includes(key);
  });
  return match?.id ?? null;
}

export function resolveFocusLinkedTaskId(
  linkedTaskId: number | null | undefined,
  linkedJiraKey: string | null | undefined,
  tasks: { id: number; title: string }[]
): number | null {
  if (linkedTaskId != null) return linkedTaskId;
  return findTaskIdByJiraKey(tasks, linkedJiraKey);
}
