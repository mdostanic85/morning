const RAW_SIGNAL_MARKERS = [
  "marked as in focus",
  "queued as next",
  "fresh signal",
  "meeting transcript instruction",
  "committed in a meeting",
  "explicit instruction from",
  "linked jira operational state",
  "confirmed by ",
  "signal from ",
];

export function isRawPriorityExplanation(value: string): boolean {
  const normalized = value.toLowerCase();
  const markerCount = RAW_SIGNAL_MARKERS.filter((marker) => normalized.includes(marker)).length;
  const separatorCount = (value.match(/·/g) ?? []).length;
  return value.length > 420 || separatorCount >= 2 || markerCount >= 2;
}

function jiraContext(value: string): string | null {
  const key = value.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1];
  if (!key) return null;
  if (/actively in progress|in progress/i.test(value)) return `${key} is already in progress`;
  return `${key} is the linked active Jira issue`;
}

export function priorityExplanationForDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !isRawPriorityExplanation(trimmed)) return trimmed;

  const jira = jiraContext(trimmed);
  const meetingCommitment =
    /meeting transcript instruction|committed in a meeting|explicit instruction from matt or lucas/i.test(
      trimmed
    );
  const blocksOthers = /blocks other people|blocking/i.test(trimmed);
  const directRequest = /direct stakeholder request/i.test(trimmed);
  const dueNow = /due today|overdue/i.test(trimmed);
  const meetingPrep = /covers this — prepare before it/i.test(trimmed);
  const reviewFeedback = /review feedback needs action|review comment|changes requested/i.test(
    trimmed
  );

  let trigger: string;
  if (meetingCommitment && jira) {
    trigger = `This is first because it was explicitly committed in a recent meeting you attended and ${jira}.`;
  } else if (meetingCommitment) {
    trigger =
      "This is first because it was explicitly committed in a recent meeting you attended.";
  } else if (blocksOthers) {
    trigger = "This is first because other people or delivery are blocked until it moves forward.";
  } else if (dueNow) {
    trigger = "This is first because its evidenced deadline is today or already overdue.";
  } else if (meetingPrep) {
    trigger =
      "This is first because a meeting later today covers it, so the prep has to happen before then.";
  } else if (directRequest) {
    trigger = "This is first because it is the clearest current stakeholder request.";
  } else if (reviewFeedback) {
    trigger = "This is first because concrete review feedback is waiting to be addressed.";
  } else if (jira) {
    trigger = `This is first because ${jira}.`;
  } else {
    trigger = "This is first because it is the strongest current commitment in today’s evidence.";
  }

  return `${trigger} Move this commitment forward before starting lower-priority work.`;
}
