export type BlockerKind = "blocked" | "waiting" | "info" | "risk";

export interface BlockerEntry {
 id: string;
 kind: BlockerKind;
 text: string;
}

const KIND_META: Record<
 BlockerKind,
 { label: string; className: string; itemClassName: string }
> = {
 blocked: {
 label: "Blocked",
 className: "text-danger",
 itemClassName: "border-danger/25 bg-danger/5 text-foreground",
 },
 waiting: {
 label: "Waiting on",
 className: "text-waiting",
 itemClassName: "border-waiting/25 bg-waiting/5 text-foreground",
 },
 info: {
 label: "FYI",
 className: "text-muted",
 itemClassName: "border-border bg-surface-soft/70 text-muted",
 },
 risk: {
 label: "Risk to watch",
 className: "text-warm",
 itemClassName: "border-warm/25 bg-warm/5 text-muted",
 },
};

function classifyWaitingText(text: string, taskWaitingOn?: string | null): BlockerKind {
 const normalized = text.trim().toLowerCase();
 if (taskWaitingOn && text === taskWaitingOn) return "waiting";
 if (/\b(blocked|cannot|can't|unable)\b/.test(normalized)) return "blocked";
 if (/\b(wait|await|pending|approval|sign[- ]?off)\b/.test(normalized)) return "waiting";
 if (/\b(risk|might|could delay|watch)\b/.test(normalized)) return "risk";
 return "info";
}

export function buildBlockerEntries(input: {
 taskWaitingOn?: string | null;
 briefingWaitingOn?: string[];
 briefingRisks?: string[];
}): BlockerEntry[] {
 const entries: BlockerEntry[] = [];
 const seen = new Set<string>();

 const add = (kind: BlockerKind, text: string) => {
 const trimmed = text.trim();
 if (!trimmed || seen.has(trimmed)) return;
 seen.add(trimmed);
 entries.push({ id: `${kind}-${trimmed}`, kind, text: trimmed });
 };

 if (input.taskWaitingOn?.trim()) {
 add("waiting", input.taskWaitingOn.trim());
 }

 for (const item of input.briefingWaitingOn ?? []) {
 add(classifyWaitingText(item, input.taskWaitingOn), item);
 }

 for (const risk of input.briefingRisks ?? []) {
 add("risk", risk);
 }

 return entries;
}

export function BlockersCard({
 entries,
 id = "blokade",
}: {
 entries: BlockerEntry[];
 id?: string;
}) {
 if (entries.length === 0) {
 return (
 <aside
 id={id}
 className="scroll-mt-24 rounded-today-card border border-border bg-surface p-6 sm:p-8 lg:col-span-5"
 >
 <p className="eyebrow text-good">No active blocker</p>
 <p className="mt-3 text-sm leading-relaxed text-muted">
 Continue with the current next action. New constraints will appear here after a sync.
 </p>
 </aside>
 );
 }

 const primary = entries.find((entry) => entry.kind === "blocked" || entry.kind === "waiting") ?? entries[0];

 return (
 <aside
 id={id}
 className="scroll-mt-24 rounded-today-card border border-waiting/25 bg-waiting/5 p-6 sm:p-8 lg:col-span-5"
 >
 <p className="eyebrow text-waiting">Blocked or waiting</p>
 {primary ? (
 <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">
 {primary.kind === "waiting" ? `Waiting for ${primary.text}` : primary.text}
 </p>
 ) : null}
 <ul className="mt-4 space-y-2.5">
 {entries.map((entry) => {
 const meta = KIND_META[entry.kind];
 return (
 <li
 key={entry.id}
 className={`rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${meta.itemClassName}`}
 >
 <span className={`text-xs font-semibold uppercase tracking-wide ${meta.className}`}>
 {meta.label}
 </span>
 <p className="mt-1">{entry.text}</p>
 </li>
 );
 })}
 </ul>
 </aside>
 );
}
