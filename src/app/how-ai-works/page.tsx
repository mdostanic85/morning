import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  CircleHelp,
  EyeOff,
  FileWarning,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { AppBadge } from "@/components/AppBadge";

export const metadata = {
  title: "How we decide — Worklight",
  description:
    "How Worklight decides what is valid for Today, what becomes Unclear, and what stays hidden.",
};

const OUTCOMES = [
  {
    title: "Valid for Today",
    tone: "good" as const,
    icon: CheckCircle2,
    meaning: "Clearly yours, open, and backed by evidence.",
    examples: ["Jira assignee is you", "You said “I’ll…” in a meeting", "Has quote + next action + done check"],
  },
  {
    title: "Unclear",
    tone: "warning" as const,
    icon: CircleHelp,
    meaning: "Visible, but you must clarify before acting.",
    examples: ["Owner ambiguous", "Requirement too vague", "Evidence missing or unverifiable"],
  },
  {
    title: "Not yours",
    tone: "neutral" as const,
    icon: EyeOff,
    meaning: "Hidden from Today — never ranked as your focus.",
    examples: ["Someone else is the actor", "Bare name mention only", "Assigned to another person"],
  },
  {
    title: "Out of Today",
    tone: "danger" as const,
    icon: Ban,
    meaning: "Finished work is not active focus.",
    examples: ["Jira Done / Closed / Resolved", "Freshest evidence says completed", "Already finalized that day"],
  },
];

const RULES = [
  {
    id: "ownership",
    title: "1. Ownership first",
    body: "Today only ranks work that is clearly yours. A bare mention of your name is not ownership.",
    valid: [
      "Jira assignee matches you",
      "Owner field matches your name (including short forms)",
      "First-person commitment (“I’ll…”, “for me to…”)",
      "You are named as the actor (“Milos to send…”)",
    ],
    invalid: [
      "Only mentioned in a meeting, no action assigned to you",
      "Someone else is the named actor",
      "No name in Settings → ownership stays ambiguous",
    ],
  },
  {
    id: "evidence",
    title: "2. Evidence over assertion",
    body: "Every task must carry a real source quote, a concrete next action, and a checkable done definition. No inventing.",
    valid: [
      "At least one verbatim quote from a synced source",
      "Quote actually appears in that source",
      "Next action and done criteria grounded in the same evidence",
    ],
    invalid: [
      "AI claim with no source",
      "Quote that doesn’t match the source text",
      "Vague “work on it / make progress” with no concrete change",
    ],
  },
  {
    id: "ambiguity",
    title: "3. Ambiguity → Unclear, never a confident guess",
    body: "If ownership or the requirement is fuzzy, Worklight shows it as Unclear instead of inventing an owner or scope.",
    valid: [
      "Unclear items stay visible for you to resolve",
      "Low interpretation confidence (< ~50%) is treated as Unclear",
      "Missing linked Jira context → clarify first, don’t invent scope",
    ],
    invalid: [
      "Forcing an unclear item into “First today”",
      "Inventing done criteria the source never stated",
      "Assuming you’re the owner because you were in the room",
    ],
  },
  {
    id: "conflicts",
    title: "4. Conflicts stay visible",
    body: "Worklight flags source disagreement for review. Open the task to compare available evidence.",
    valid: [
      "Conflict banner with both sides’ evidence",
      "Freshest ~5-day window per task for competing signals",
      "Stakeholder meeting instruction can outrank a newer weak source",
    ],
    invalid: [
      "Picking one source and hiding the other",
      "Treating calendar invite mail as a meeting transcript",
      "Keeping a transcript “still open” when Jira is Done for that key",
      "Claiming a durable conflict decision is stored before you choose one",
    ],
  },
  {
    id: "confidence",
    title: "5. Confidence ≠ urgency",
    body: "Confidence is how sure we are the task was correctly understood from sources — not how urgent it is.",
    valid: [
      "High ≥ 70% · Medium 40–69% · Low under 40%",
      "Low confidence → review evidence / Unclear treatment",
      "Unresolved conflict lowers confidence and stays on screen",
    ],
    invalid: [
      "Using priority score as confidence",
      "Treating unscored as 100% trusted",
      "Hiding low-confidence items instead of flagging them",
    ],
  },
];

const FLOW = [
  { label: "Sync sources", hint: "Jira, meetings, docs, design…" },
  { label: "Extract candidates", hint: "Only with quotes" },
  { label: "Filter ownership", hint: "Yours / other / unclear" },
  { label: "Drop finished work", hint: "Done / completed" },
  { label: "Rank what’s left", hint: "Today first · next up" },
];

export default function HowWeDecidePage() {
  return (
    <div className="decide-page">
      <header className="decide-hero">
        <p className="decide-eyebrow">Rules of the brief</p>
        <h1>How Worklight decides what is valid</h1>
        <p className="decide-lead">
          Today is not a dump of everything synced. It is a short list of work that is{" "}
          <strong>yours</strong>, <strong>open</strong>, and <strong>backed by evidence</strong>.
          Everything else is clarified, hidden, or dropped — on purpose.
        </p>
        <nav className="decide-jumpnav" aria-label="Jump to section">
          <a href="#outcomes">Outcomes</a>
          <a href="#pipeline">Pipeline</a>
          <a href="#rules">Rules</a>
          <a href="#pillars">Pillars</a>
        </nav>
      </header>

      <section id="outcomes" className="decide-outcomes" aria-label="Possible outcomes">
        {OUTCOMES.map((outcome) => {
          const Icon = outcome.icon;
          return (
            <article key={outcome.title} className="decide-outcome">
              <div className="decide-outcome-top">
                <AppBadge
                  tone={outcome.tone}
                  icon={<Icon className="size-3.5" aria-hidden />}
                >
                  {outcome.title}
                </AppBadge>
              </div>
              <p className="decide-outcome-meaning">{outcome.meaning}</p>
              <ul>
                {outcome.examples.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section id="pipeline" className="decide-flow" aria-label="Decision pipeline">
        <div className="decide-section-head">
          <ShieldCheck className="size-4 text-accent-strong" aria-hidden />
          <h2>The pipeline</h2>
        </div>
        <p className="decide-section-lead">
          Order matters. Ownership and evidence run before ranking. Empty is better than a forced
          guess.
        </p>
        <ol className="decide-flow-track">
          {FLOW.map((step, index) => (
            <li key={step.label}>
              <span className="decide-flow-index" aria-hidden>
                {index + 1}
              </span>
              <strong>{step.label}</strong>
              <span>{step.hint}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="rules" className="decide-rules" aria-label="Decision rules">
        <div className="decide-section-head">
          <Scale className="size-4 text-accent-strong" aria-hidden />
          <h2>Valid vs not</h2>
        </div>
        <div className="decide-rule-list">
          {RULES.map((rule) => (
            <article key={rule.id} id={rule.id} className="decide-rule">
              <h3>{rule.title}</h3>
              <p>{rule.body}</p>
              <div className="decide-rule-cols">
                <div className="decide-col decide-col-valid">
                  <p className="decide-col-label">
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Counts as valid
                  </p>
                  <ul>
                    {rule.valid.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="decide-col decide-col-invalid">
                  <p className="decide-col-label">
                    <FileWarning className="size-3.5" aria-hidden />
                    Does not count
                  </p>
                  <ul>
                    {rule.invalid.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="pillars" className="decide-pillars" aria-label="Task pillars">
        <h2>Every surfaced task must show three pillars</h2>
        <div className="decide-pillar-grid">
          <div>
            <AppBadge tone="sky">Evidence</AppBadge>
            <p>The quote or link that justifies the task existing.</p>
          </div>
          <div>
            <AppBadge tone="accent">Next action</AppBadge>
            <p>One concrete step you can do next — not “make progress.”</p>
          </div>
          <div>
            <AppBadge tone="good">Done criteria</AppBadge>
            <p>How you know it is truly finished, checkable from the source.</p>
          </div>
        </div>
        <p className="decide-footnote-inline">
          Missing any of these → clarify first. Worklight will not invent them to look complete.
        </p>
      </section>

      <footer className="decide-footer">
        <p>
          Set your name in Settings so ownership filtering works. Then Sync my day — Today only
          keeps what these rules allow.
        </p>
        <div className="decide-footer-actions">
          <Link href="/settings" className="decide-link">
            Open Settings
          </Link>
          <Link href="/" className="decide-link decide-link-primary">
            Back to Today
          </Link>
        </div>
      </footer>
    </div>
  );
}
