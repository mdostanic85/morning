import { ExternalLinkIcon } from "lucide-react";
import type { BriefingSourceUsed } from "@/lib/llm/prompts/todayBriefing";
import { DailyFocusCard, type DailyFocusData } from "./DailyFocusCard";
import { EvidencePanel, type EvidenceItem } from "./EvidencePanel";
import { SourceBadge } from "./SourceBadge";

export interface TodayBriefingFocusItem extends DailyFocusData {
  linkedTaskId: number | null;
  linkedJiraKey: string | null;
}

export interface TodayBriefingJiraItem {
  key: string;
  title: string;
  status: string;
  reason: string;
  nextAction: string;
  actionSteps?: string[];
  referenceLinks?: { label: string; url: string }[];
  doneCriteria: string[];
  evidence: EvidenceItem[];
  url: string | null;
  priorityExplanation?: string;
}

export interface TodayBriefingKnowledgeHighlight {
  title: string;
  content: string;
  type: string;
  evidence: EvidenceItem[];
}

export interface TodayBriefingProps {
  summary: string;
  generatedAt: string;
  focusItems: TodayBriefingFocusItem[];
  jiraPending: TodayBriefingJiraItem[];
  knowledgeHighlights: TodayBriefingKnowledgeHighlight[];
  waitingOn: string[];
  risks: string[];
  jiraIssueCount: number;
  sourcesUsed: BriefingSourceUsed[];
  connectedProviders: string[];
}

function SourcesUsedSection({
  sourcesUsed,
  connectedProviders,
}: {
  sourcesUsed: BriefingSourceUsed[];
  connectedProviders: string[];
}) {
  if (sourcesUsed.length === 0 && connectedProviders.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-soft/40 p-5">
      <p className="eyebrow">Sources used for this briefing</p>
      {connectedProviders.length > 0 ? (
        <p className="mt-2 text-[13px] text-muted">
          Connected: {connectedProviders.join(", ")}
        </p>
      ) : null}
      {sourcesUsed.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {sourcesUsed.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]"
            >
              <SourceBadge sourceType={source.sourceType as Parameters<typeof SourceBadge>[0]["sourceType"]} />
              <span className="font-medium text-foreground">{source.title}</span>
              {source.projectName ? (
                <span className="text-muted">{source.projectName}</span>
              ) : null}
              <span className="text-muted-soft">
                {new Date(source.sourceDate).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  Open
                  <ExternalLinkIcon className="size-3" aria-hidden />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-muted">No new source items today — briefing used your open queue.</p>
      )}
    </div>
  );
}

export function TodayBriefing({
  summary,
  generatedAt,
  focusItems,
  jiraPending: _jiraPending,
  knowledgeHighlights,
  waitingOn,
  risks,
  jiraIssueCount,
  sourcesUsed,
  connectedProviders,
}: TodayBriefingProps) {
  const primary = focusItems[0];
  const hasSecondaryContent =
    knowledgeHighlights.length > 0 ||
    waitingOn.length > 0 ||
    risks.length > 0 ||
    sourcesUsed.length > 0 ||
    connectedProviders.length > 0;

  return (
    <section className="space-y-6">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow text-warm">Today&apos;s briefing</h2>
          <span className="text-xs text-muted-soft">
            Updated {new Date(generatedAt).toLocaleString()}
          </span>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{summary}</p>
      </div>

      {primary ? <DailyFocusCard item={primary} /> : null}

      {jiraIssueCount > 0 && focusItems.length > 0 ? (
        <p className="text-[13px] leading-relaxed text-muted">
          {jiraIssueCount} open Jira issue{jiraIssueCount === 1 ? "" : "s"} ranked in the background —
          only today&apos;s focus is shown here. The rest stay in your queue.
        </p>
      ) : null}

      {hasSecondaryContent ? (
        <details className="group">
          <summary className="cursor-pointer list-none">
            <span className="eyebrow text-muted-soft transition-colors group-hover:text-muted">
              More from today&apos;s sync
            </span>
          </summary>
          <div className="card mt-4 space-y-6 p-6 sm:p-8">
            {knowledgeHighlights.length > 0 ? (
              <div>
                <p className="eyebrow">Knowledge</p>
                <ul className="mt-4 space-y-4">
                  {knowledgeHighlights.map((item) => (
                    <li key={item.title} className="rounded-xl border border-border px-4 py-4">
                      <p className="text-xs uppercase tracking-wide text-muted-soft">{item.type}</p>
                      <p className="mt-1 font-medium">{item.title}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{item.content}</p>
                      <div className="mt-3">
                        <EvidencePanel items={item.evidence} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {waitingOn.length > 0 ? (
              <div>
                <p className="eyebrow">Waiting on</p>
                <p className="mt-2 text-sm leading-relaxed text-waiting">{waitingOn.join(" · ")}</p>
              </div>
            ) : null}

            {risks.length > 0 ? (
              <div className="rounded-xl border border-warm/30 bg-warm/5 px-4 py-4">
                <p className="eyebrow text-warm">Risks</p>
                <ul className="mt-2 list-inside list-disc text-sm leading-relaxed text-warm">
                  {risks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <SourcesUsedSection sourcesUsed={sourcesUsed} connectedProviders={connectedProviders} />
          </div>
        </details>
      ) : null}
    </section>
  );
}
