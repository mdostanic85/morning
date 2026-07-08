import type { WorkTaskStatus } from "@/domain/workTask";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { EvidencePanel, type EvidenceItem } from "./EvidencePanel";

export interface TaskCardProps {
  title: string;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  evidence: EvidenceItem[];
  status: WorkTaskStatus;
  confidence?: number | null;
  waitingOn?: string | null;
  owner?: string | null;
  dueDate?: string | null;
  projectName?: string | null;
}

export function TaskCard({
  title,
  reason,
  nextAction,
  doneCriteria,
  evidence,
  status,
  confidence,
  waitingOn,
  owner,
  dueDate,
  projectName,
}: TaskCardProps) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-medium leading-snug">{title}</h3>
        {confidence != null ? <ConfidenceBadge level={confidence} /> : null}
      </div>

      {projectName ? (
        <p className="mt-0.5 text-[12px] text-muted">{projectName}</p>
      ) : null}

      <p
        className={
          status === "unclear"
            ? "mt-2 text-[13px] font-medium text-[#9c2b2b]"
            : "mt-2 text-[13px] text-muted"
        }
      >
        {status === "unclear" ? "Unclear — " : null}
        {reason}
      </p>

      {waitingOn ? (
        <p className="mt-2 text-[13px] font-medium text-[#8a6d00]">
          Waiting on {waitingOn}
        </p>
      ) : null}

      <div className="mt-3">
        <p className="text-[11px] uppercase tracking-wide text-muted">Next action</p>
        <p className="text-[14px] mt-0.5">{nextAction}</p>
      </div>

      {doneCriteria.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">Done when</p>
          <ul className="mt-0.5 space-y-1">
            {doneCriteria.map((label) => (
              <li key={label} className="text-[14px] flex items-start gap-2">
                <span className="mt-0.5 text-muted">–</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(owner || dueDate) && (
        <p className="mt-3 text-[12px] text-muted">
          {owner ? `Owner: ${owner}` : null}
          {owner && dueDate ? " · " : null}
          {dueDate ? `Due ${new Date(dueDate).toLocaleDateString()}` : null}
        </p>
      )}

      <div className="mt-3">
        <EvidencePanel items={evidence} />
      </div>
    </article>
  );
}
