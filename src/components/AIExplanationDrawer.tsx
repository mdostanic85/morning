"use client";

import { useEffect, type ReactNode } from "react";
import type { EvidenceItem } from "@/domain/evidenceItem";
import type { SourceType } from "@/domain/sourceItem";
import { XIcon } from "lucide-react";
import { Drawer } from "@heroui/react/drawer";
import { SourceBadge } from "./SourceBadge";
import { formatLocalTimestamp } from "@/lib/format/statusLabels";

export type AIExplanationSection = "overview" | "evidence";

interface AIExplanationDrawerProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 initialSection: AIExplanationSection;
 title: string;
 subtitle?: string;
 conclusion: string;
 reasoning: string;
 evidence: EvidenceItem[];
 verifyItems: string[];
 confidence?: number | null;
 conflicts?: string[];
 footer?: ReactNode;
}

const EVIDENCE_HIERARCHY: { label: string; types: SourceType[] }[] = [
 { label: "Latest direct instruction", types: ["gmail", "drive", "manual_transcript", "granola"] },
 { label: "Recent meeting decisions", types: ["calendar", "granola", "drive"] },
 { label: "Jira status and comments", types: ["jira"] },
 { label: "PRD and Confluence", types: ["confluence"] },
 { label: "Design artifacts", types: ["figma"] },
 { label: "Engineering signals", types: ["github", "git", "discord"] },
];

function extractionConfidenceLabel(value: number): string {
 if (value >= 0.75) return "High extraction confidence";
 if (value >= 0.5) return "Medium extraction confidence";
 return "Low extraction confidence";
}

function sortedEvidence(items: EvidenceItem[]): EvidenceItem[] {
 return [...items].sort((a, b) => {
 const aTime = a.sourceDate ? new Date(a.sourceDate).getTime() : 0;
 const bTime = b.sourceDate ? new Date(b.sourceDate).getTime() : 0;
 return bTime - aTime;
 });
}

function groupedEvidence(items: EvidenceItem[]) {
 const sorted = sortedEvidence(items);
 const used = new Set<number>();
 const groups = EVIDENCE_HIERARCHY.map((group) => {
 const entries = sorted.filter((item) => {
 if (!item.sourceType || !group.types.includes(item.sourceType) || used.has(item.id)) {
 return false;
 }
 used.add(item.id);
 return true;
 });
 return { ...group, entries };
 }).filter((group) => group.entries.length > 0);

 const remainder = sorted.filter((item) => !used.has(item.id));
 if (remainder.length > 0) {
 groups.push({ label: "Other supporting sources", types: [], entries: remainder });
 }

 return groups;
}

function DrawerSection({
 id,
 label,
 children,
}: {
 id?: string;
 label: string;
 children: ReactNode;
}) {
 return (
 <section id={id} className="scroll-mt-24 border-t border-border/70 pt-6 first:border-t-0 first:pt-0">
 <h3 className="eyebrow text-foreground/70">{label}</h3>
 <div className="mt-3">{children}</div>
 </section>
 );
}

export function AIExplanationDrawer({
 open,
 onOpenChange,
 initialSection,
 title,
 subtitle,
 conclusion,
 reasoning,
 evidence,
 verifyItems,
 confidence,
 conflicts = [],
 footer,
}: AIExplanationDrawerProps) {
 const evidenceGroups = groupedEvidence(evidence);

 useEffect(() => {
 if (!open || initialSection !== "evidence") return;
 const frame = requestAnimationFrame(() => {
 const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 document.getElementById("ai-explanation-evidence")?.scrollIntoView({
 block: "start",
 behavior: reduceMotion ? "auto" : "smooth",
 });
 });
 return () => cancelAnimationFrame(frame);
 }, [open, initialSection]);

 return (
 <Drawer isOpen={open} onOpenChange={onOpenChange}>
 <Drawer.Backdrop variant="blur" className="bg-background/75">
 <Drawer.Content placement="right" className="w-full">
 <Drawer.Dialog
 aria-label={`AI explanation for ${title}`}
 className="drawer-gradient relative flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden border-l border-border bg-overlay pt-[env(safe-area-inset-top)] text-foreground outline-none sm:max-w-xl"
 >
 <Drawer.CloseTrigger className="absolute top-3 right-3 z-20 size-9 rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-foreground">
 <XIcon className="size-4" />
 <span className="sr-only">Close</span>
 </Drawer.CloseTrigger>
 <Drawer.Header className="sticky top-0 z-10 flex flex-col gap-1.5 border-b border-border/70 bg-overlay/95 px-6 py-5 pr-14 backdrop-blur-xl">
 <p className="eyebrow text-accent">AI explanation</p>
 <Drawer.Heading className="font-display text-[26px] leading-snug tracking-[-0.035em]">
 {title}
 </Drawer.Heading>
 <p slot="description" className="text-sm text-muted">
 {subtitle || "Why this is the current priority and which sources support it."}
 </p>
 </Drawer.Header>

 <Drawer.Body className="drawer-stagger flex-1 space-y-7 overflow-y-auto px-6 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
 <DrawerSection label="Decision summary">
 <p className="text-[15px] font-medium leading-relaxed text-foreground">{conclusion}</p>
 </DrawerSection>

 <DrawerSection label="Why this ranked first">
 <p className="text-[14px] leading-relaxed text-muted">{reasoning}</p>
 {confidence != null ? (
 <p className="mt-3 text-[14px] text-muted-soft">
 {extractionConfidenceLabel(confidence)} — this reflects how confidently the task was
 extracted from sources, not how sure the app is you should do it first.
 </p>
 ) : null}
 </DrawerSection>

 {verifyItems.length > 0 ? (
 <DrawerSection label="What you should verify">
 <ul className="space-y-2.5">
 {verifyItems.map((item) => (
 <li
 key={item}
 className="accent-soft-gradient rounded-xl border border-border-strong px-4 py-3.5 text-[14px] leading-relaxed text-foreground/80"
 >
 {item}
 </li>
 ))}
 </ul>
 </DrawerSection>
 ) : null}

 {conflicts.length > 0 ? (
 <DrawerSection label="Conflicts affecting this decision">
 <ul className="space-y-2">
 {conflicts.map((conflict) => (
 <li
 key={conflict}
 className="rounded-xl border border-waiting/25 bg-waiting/8 px-4 py-3 text-[14px] leading-relaxed text-waiting"
 >
 {conflict}
 </li>
 ))}
 </ul>
 </DrawerSection>
 ) : null}

 <DrawerSection id="ai-explanation-evidence" label={`Evidence hierarchy (${evidence.length})`}>
 {evidence.length > 0 ? (
 <div className="space-y-6">
 {evidenceGroups.map((group) => (
 <div key={group.label}>
 <p className="text-xs font-semibold uppercase tracking-wide text-muted">
 {group.label}
 </p>
 <ul className="mt-3 space-y-3">
 {group.entries.map((item) => (
 <li
 key={item.id}
 className="warm-hover-gradient rounded-xl border border-border/70 bg-surface-soft/60 px-4 py-3 transition-[background,padding-left] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:pl-6"
 >
 <div className="flex flex-wrap items-center gap-2">
 {item.sourceType ? <SourceBadge sourceType={item.sourceType} /> : null}
 {item.sourceTitle ? (
 <p className="text-sm font-semibold text-foreground">{item.sourceTitle}</p>
 ) : null}
 </div>
 <p className="mt-2 text-[14px] leading-relaxed text-muted">
 {item.quote ?? item.summary}
 </p>
 <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-soft">
 {item.sourceAuthor ? <span>By {item.sourceAuthor}</span> : null}
 {item.sourceDate ? (
 <span>{formatLocalTimestamp(item.sourceDate)}</span>
 ) : null}
 {item.sourceUrl ? (
 <a
 href={item.sourceUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="text-accent hover:underline"
 >
 Open source
 </a>
 ) : null}
 </div>
 </li>
 ))}
 </ul>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-[14px] font-medium text-danger">
 No source evidence is available for this recommendation.
 </p>
 )}
 </DrawerSection>

 {footer ? <DrawerSection label="Work context">{footer}</DrawerSection> : null}
 </Drawer.Body>
 </Drawer.Dialog>
 </Drawer.Content>
 </Drawer.Backdrop>
 </Drawer>
 );
}
