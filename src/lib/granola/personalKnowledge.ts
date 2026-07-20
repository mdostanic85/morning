import type { Project } from "@/domain/project";
import type { KnowledgeItemCandidate } from "@/lib/llm/prompts/knowledgeExtractor";

export interface GranolaWorkContext {
  myName: string;
  projectNames: string[];
  keywords: string[];
  jiraKeys: string[];
  taskTitles: string[];
}

const FEEDBACK_PATTERN =
  /\b(feedback|reviewed?|looks good|needs? (more|work|changes?)|suggest(?:ion)?|recommend(?:ation)?|concern|approve|pushback|nitpick|comment(?:ed)? on your|your (?:design|work|mockup|pr|prototype|deliverable|approach))\b/i;

function normalizePerson(value: string): string {
  return value.trim().toLowerCase();
}

function tokens(text: string): string[] {
  return Array.from(
    new Set((text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter((token) => token.length >= 4))
  );
}

export function textMentionsPerson(text: string, myName: string): boolean {
  const me = normalizePerson(myName);
  if (!me) return false;

  const lowered = text.toLowerCase();
  if (lowered.includes(me)) return true;

  const firstName = me.split(/\s+/)[0];
  if (firstName && firstName.length >= 3 && lowered.includes(firstName)) return true;

  return false;
}

export function buildGranolaWorkContext(input: {
  myName: string;
  projects: Pick<Project, "name" | "keywords" | "jiraKeys">[];
  taskTitles?: string[];
}): GranolaWorkContext {
  return {
    myName: input.myName.trim(),
    projectNames: [...new Set(input.projects.map((project) => project.name).filter(Boolean))],
    keywords: [...new Set(input.projects.flatMap((project) => project.keywords).filter(Boolean))],
    jiraKeys: [...new Set(input.projects.flatMap((project) => project.jiraKeys).filter(Boolean))],
    taskTitles: input.taskTitles ?? [],
  };
}

function matchesMyActiveWork(text: string, context: GranolaWorkContext): boolean {
  const haystack = text.toLowerCase();

  for (const key of context.jiraKeys) {
    if (haystack.includes(key.toLowerCase())) return true;
  }

  for (const name of context.projectNames) {
    const normalized = name.trim().toLowerCase();
    if (normalized.length >= 3 && haystack.includes(normalized)) return true;
  }

  for (const keyword of context.keywords) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized.length >= 4 && haystack.includes(normalized)) return true;
  }

  for (const title of context.taskTitles) {
    for (const token of tokens(title)) {
      if (token.length >= 5 && haystack.includes(token)) return true;
    }
  }

  return false;
}

function isFeedbackDirectedAtUser(text: string, myName: string): boolean {
  if (!textMentionsPerson(text, myName)) return false;
  return FEEDBACK_PATTERN.test(text);
}

function isPersonalWorkSignal(text: string, myName: string): boolean {
  if (!textMentionsPerson(text, myName)) return false;
  return /\b(you|your|assigned to|owner|deliverable|mockup|design|ship|finish|complete|blocked on|waiting on you)\b/i.test(
    text
  );
}

export function granolaTextsMatchMe(texts: string[], context: GranolaWorkContext): boolean {
  const combined = texts.filter(Boolean).join("\n");
  if (!combined.trim()) return false;

  for (const text of texts) {
    if (isFeedbackDirectedAtUser(text, context.myName)) return true;
    if (isPersonalWorkSignal(text, context.myName)) return true;
    if (textMentionsPerson(text, context.myName) && matchesMyActiveWork(text, context)) {
      return true;
    }
  }

  return (
    textMentionsPerson(combined, context.myName) && matchesMyActiveWork(combined, context)
  );
}

export function granolaKnowledgeCandidateMatchesMe(
  candidate: KnowledgeItemCandidate,
  context: GranolaWorkContext
): boolean {
  const texts = [
    candidate.title,
    candidate.content,
    ...candidate.evidence.map((entry) => entry.quote),
  ];
  return granolaTextsMatchMe(texts, context);
}

export function granolaSourceBodyMatchesMe(body: string, context: GranolaWorkContext): boolean {
  return granolaTextsMatchMe([body], context);
}

export function buildGranolaExtractionInstructions(context: GranolaWorkContext): string {
  const workHints = [
    context.projectNames.length > 0
      ? `Active projects: ${context.projectNames.join(", ")}`
      : null,
    context.jiraKeys.length > 0 ? `Jira keys: ${context.jiraKeys.join(", ")}` : null,
    context.taskTitles.length > 0
      ? `Current task focus: ${context.taskTitles.slice(0, 6).join("; ")}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return [
    `GRANOLA MEETING — personal filter for ${context.myName}:`,
    "- Extract ONLY knowledge that is directly about this user's work or feedback given TO them.",
    "- Include: feedback/critique/praise on their deliverables; decisions or requirements that change their work; deadlines/risks blocking them; explicit commitments assigned to them.",
    "- Exclude: other attendees' status updates, team news they are not part of, scheduling, small talk, background discussion unrelated to their deliverables.",
    "- Every item must name or clearly implicate the user's work — if the source only discusses others' tasks with no tie to this user, return an empty items array.",
    workHints ? `- Use this as "their work" context:\n${workHints}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
