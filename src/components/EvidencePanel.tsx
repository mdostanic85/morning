"use client";

import { useState } from "react";
import { ChevronDownIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import type { EvidenceItem } from "@/domain/evidenceItem";
import { cn } from "@/lib/utils";
import { Button } from "@heroui/react/button";
import { Drawer } from "@heroui/react/drawer";
import { SourceBadge } from "./SourceBadge";

export type { EvidenceItem } from "@/domain/evidenceItem";

interface EvidencePanelProps {
 items: EvidenceItem[];
 /** @deprecated Sources open in a modal; this prop is ignored. */
 defaultOpen?: boolean;
 previewLength?: number;
 onViewSources?: () => void;
}

function formatSourceDate(value: string | null | undefined): string | null {
 if (!value) return null;
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return null;
 return date.toLocaleString(undefined, {
 month: "short",
 day: "numeric",
 year: "numeric",
 hour: "numeric",
 minute: "2-digit",
 });
}

function ExpandableText({
 text,
 previewLength = 280,
 className,
}: {
 text: string;
 previewLength?: number;
 className?: string;
}) {
 const [expanded, setExpanded] = useState(false);
 const trimmed = text.trim();
 const isLong = trimmed.length > previewLength;

 if (!isLong) {
 return <p className={className}>{trimmed}</p>;
 }

 return (
 <div className={className}>
 <p className="whitespace-pre-line">{expanded ? trimmed : `${trimmed.slice(0, previewLength).trimEnd()}…`}</p>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="mt-2 h-auto px-0 text-accent hover:bg-transparent hover:text-accent-strong"
 onPress={() => setExpanded((value) => !value)}
 aria-expanded={expanded}
 >
 {expanded ? "Show less" : "View more"}
 </Button>
 </div>
 );
}

export function EvidenceSourceList({
 items,
 previewLength = 280,
}: {
 items: EvidenceItem[];
 previewLength?: number;
}) {
 return (
 <ul className="space-y-2.5">
 {items.map((item, index) => {
 const formattedDate = formatSourceDate(item.sourceDate);
 const isLatest = index === 0 && items.length > 1;

 return (
 <li
 key={item.id}
 className="rounded-xl border border-border/70 bg-surface-soft/70 p-4"
 >
 <div className="flex flex-wrap items-center gap-2">
 {item.sourceType ? <SourceBadge sourceType={item.sourceType} /> : null}
 {isLatest ? (
 <span className="text-[14px] font-medium uppercase tracking-wide text-accent">
 Latest
 </span>
 ) : null}
 {formattedDate ? (
 <span className="text-[14px] text-muted-soft">{formattedDate}</span>
 ) : null}
 </div>
 {item.quote ? (
 <blockquote className="mt-3 border-l-2 border-warm/50 pl-4 text-sm italic leading-relaxed text-foreground/85">
 <ExpandableText text={item.quote} previewLength={previewLength} />
 </blockquote>
 ) : null}
 {item.summary && item.summary !== item.quote ? (
 <ExpandableText
 text={item.summary}
 previewLength={previewLength}
 className={cn(
 "leading-relaxed",
 item.quote ? "mt-2 text-muted" : "mt-3 text-foreground/80"
 )}
 />
 ) : null}
 <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
 {item.sourceTitle ? (
 <span className="text-xs text-muted-soft">{item.sourceTitle}</span>
 ) : null}
 {item.sourceAuthor ? (
 <span className="text-xs text-muted-soft">by {item.sourceAuthor}</span>
 ) : null}
 {item.sourceUrl ? (
 <a
 href={item.sourceUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
 >
 Open source
 <ExternalLinkIcon className="size-3" aria-hidden />
 </a>
 ) : (
 <span className="text-xs text-muted-soft">Source link unavailable</span>
 )}
 </div>
 </li>
 );
 })}
 </ul>
 );
}

export function EvidencePanel({
 items,
 previewLength = 280,
 onViewSources,
}: EvidencePanelProps) {
 const [open, setOpen] = useState(false);
 const sortedItems = [...items].sort((a, b) => {
 const aTime = a.sourceDate ? new Date(a.sourceDate).getTime() : 0;
 const bTime = b.sourceDate ? new Date(b.sourceDate).getTime() : 0;
 return bTime - aTime;
 });
 const latestItem = sortedItems[0];

 if (items.length === 0) {
 return (
 <p className="text-sm font-medium text-danger">
 No evidence recorded — this task should not have been created.
 </p>
 );
 }

 return (
 <div className="text-sm">
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="h-9 w-full justify-between"
 onPress={() => {
 if (onViewSources) onViewSources();
 else setOpen(true);
 }}
 aria-label={`View sources (${items.length} items)`}
 >
 <span>View sources ({items.length})</span>
 <ChevronDownIcon className="size-3.5" aria-hidden />
 </Button>

 {latestItem ? (
 <div className="mt-3 rounded-xl border border-border/70 bg-surface-soft/50 p-3">
 <div className="flex flex-wrap items-center gap-2">
 {latestItem.sourceType ? <SourceBadge sourceType={latestItem.sourceType} /> : null}
 {latestItem.sourceTitle ? (
 <span className="text-xs text-muted-soft">{latestItem.sourceTitle}</span>
 ) : null}
 </div>
 {latestItem.quote ? (
 <p className="mt-2 text-[14px] italic leading-relaxed text-foreground/85">
 &ldquo;{latestItem.quote.length > 160 ? `${latestItem.quote.slice(0, 160).trimEnd()}…` : latestItem.quote}&rdquo;
 </p>
 ) : null}
 </div>
 ) : null}

 {!onViewSources ? (
 <Drawer isOpen={open} onOpenChange={setOpen}>
 <Drawer.Backdrop variant="blur" className="bg-background/75">
 <Drawer.Content placement="right" className="w-full">
 <Drawer.Dialog
 aria-label={`Sources (${items.length})`}
 className="relative flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden border-l border-border bg-overlay pt-[env(safe-area-inset-top)] text-foreground outline-none sm:max-w-xl"
 >
 <Drawer.Header className="sticky top-0 z-10 bg-overlay/95 backdrop-blur-xl flex flex-col gap-1.5 border-b border-border/70 px-6 py-5 pr-14">
 <Drawer.Heading className="text-lg font-medium tracking-tight">
 Sources ({items.length})
 </Drawer.Heading>
 <p slot="description" className="text-sm text-muted">
 Evidence that supports this item, newest first.
 </p>
 </Drawer.Header>
 <Drawer.Body className="flex-1 overflow-y-auto px-6 py-5">
 <EvidenceSourceList items={sortedItems} previewLength={previewLength} />
 </Drawer.Body>
 <Drawer.CloseTrigger className="absolute top-3 right-3 size-9 rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-foreground">
 <XIcon className="size-4" />
 <span className="sr-only">Close</span>
 </Drawer.CloseTrigger>
 </Drawer.Dialog>
 </Drawer.Content>
 </Drawer.Backdrop>
 </Drawer>
 ) : null}
 </div>
 );
}
