"use client";

import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { ExternalLinkIcon, Loader2Icon, XIcon } from "lucide-react";
import { Toast } from "@heroui/react/toast";
import type { KnowledgeItemType } from "@/domain/knowledgeItem";
import type { SourceType } from "@/domain/sourceItem";
import { SourceBadge } from "@/components/SourceBadge";
import { Chip } from "@heroui/react/chip";
import { Button } from "@heroui/react/button";
import { AlertDialog } from "@heroui/react/alert-dialog";
import { Drawer } from "@heroui/react/drawer";

export interface KnowledgeItemCardData {
 id: number;
 type: KnowledgeItemType;
 title: string;
 content: string;
 confidence: number | null;
 evidenceQuotes: string[];
 createdAt: string;
 sourceTitle: string | null;
 sourceType: SourceType | null;
 sourceUrl: string | null;
 sourceDate: string | null;
 projectName: string | null;
}

const TYPE_LABEL: Record<KnowledgeItemType, string> = {
 requirement: "Requirement",
 decision: "Decision",
 open_question: "Open question",
 risk: "Risk",
 deadline: "Deadline",
 stakeholder_preference: "Stakeholder preference",
 acceptance_criteria: "Acceptance criteria",
};

function preview(text: string, max = 220): string {
 const trimmed = text.trim();
 return trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed;
}

function formatItemDate(value: string): string {
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return value;
 return date.toLocaleString(undefined, {
 month: "short",
 day: "numeric",
 year: "numeric",
 hour: "numeric",
 minute: "2-digit",
 });
}

function itemDisplayDate(item: KnowledgeItemCardData): string {
 return item.sourceDate ?? item.createdAt;
}

function SourceLink({
 url,
 title,
}: {
 url: string;
 title: string;
}) {
 return (
 <a
 href={url}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
 >
 <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
 {title}
 </a>
 );
}

export function KnowledgeItemCard({
 item,
 previewMax = 220,
 allowDelete = true,
}: {
 item: KnowledgeItemCardData;
 previewMax?: number;
 allowDelete?: boolean;
}) {
 const router = useRouter();
 const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
 const [isDeleting, setIsDeleting] = useState(false);
 const hasEvidence = item.evidenceQuotes.length > 0;
 const displayDate = itemDisplayDate(item);

 async function runDelete() {
 setIsDeleting(true);
 setDeleteConfirmOpen(false);
 try {
 const res = await fetch(`/api/knowledge-items/${item.id}`, { method: "DELETE" });
 if (!res.ok) throw new Error("Delete failed.");
 Toast.toast.success("Knowledge item removed.");
 router.refresh();
 } catch {
 Toast.toast.danger("Could not delete knowledge item. Try again.");
 } finally {
 setIsDeleting(false);
 }
 }

 return (
 <article className="app-card overflow-hidden" id={`knowledge-${item.id}`}>
 <div className="flex items-start justify-between gap-3 border-b border-border/50 px-5 py-3">
 <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
 <Chip variant="secondary">{TYPE_LABEL[item.type]}</Chip>
 <time className="text-xs tabular-nums text-muted-soft" dateTime={displayDate}>
 {formatItemDate(displayDate)}
 </time>
 {item.confidence != null ? (
 <span className="text-xs tabular-nums text-muted">{Math.round(item.confidence * 100)}%</span>
 ) : null}
 {item.projectName ? (
 <span className="text-xs text-muted-soft">{item.projectName}</span>
 ) : null}
 </div>
 {item.sourceType ? <SourceBadge sourceType={item.sourceType} /> : null}
 </div>

 <div className="px-5 py-4">
 <h3 className="text-base font-medium leading-snug">{item.title}</h3>
 <p className="mt-2 text-sm leading-relaxed text-muted">{preview(item.content, previewMax)}</p>
 </div>

 <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 bg-surface-soft/30 px-5 py-3">
 <div className="flex flex-wrap items-center gap-2">
 <Drawer>
 <Drawer.Trigger render={(props) => <Button {...(props as ComponentProps<typeof Button>)} variant="outline" size="sm">Read more</Button>} />
 <Drawer.Backdrop variant="blur" className="bg-background/75">
 <Drawer.Content placement="right" className="w-full">
 <Drawer.Dialog className="relative flex h-[100dvh] w-full max-w-xl flex-col gap-0 overflow-hidden border-l border-border bg-overlay pt-[env(safe-area-inset-top)] text-foreground outline-none">
 <Drawer.CloseTrigger className="absolute top-3 right-3 size-9 rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-foreground">
 <XIcon className="size-4" />
 <span className="sr-only">Close</span>
 </Drawer.CloseTrigger>
 <Drawer.Header className="flex flex-col gap-1.5 border-b border-border/70 px-6 py-5 pr-14">
 <div className="flex flex-wrap items-center gap-2">
 <Chip variant="secondary">{TYPE_LABEL[item.type]}</Chip>
 {item.sourceType ? <SourceBadge sourceType={item.sourceType} /> : null}
 </div>
 <Drawer.Heading className="text-lg font-medium tracking-tight">{item.title}</Drawer.Heading>
 <p slot="description" className="text-sm text-muted">
 {[item.projectName, formatItemDate(displayDate)].filter(Boolean).join(" · ")}
 </p>
 </Drawer.Header>
 <Drawer.Body className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
 <section>
 <p className="eyebrow">Content</p>
 <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{item.content}</p>
 </section>

 {hasEvidence ? (
 <section>
 <p className="eyebrow">Evidence</p>
 <ul className="mt-2 space-y-2">
 {item.evidenceQuotes.map((quote, index) => (
 <li
 key={index}
 className="rounded-xl border border-border/70 bg-surface-soft/70 p-4 text-sm italic leading-relaxed text-foreground/85"
 >
 &ldquo;{quote}&rdquo;
 </li>
 ))}
 </ul>
 </section>
 ) : null}

 {item.sourceTitle || item.sourceUrl ? (
 <section>
 <p className="eyebrow">Source</p>
 <div className="mt-2 space-y-1">
 {item.sourceTitle ? (
 <p className="text-sm font-medium">{item.sourceTitle}</p>
 ) : null}
 {item.sourceUrl ? (
 <SourceLink url={item.sourceUrl} title="Open original source" />
 ) : null}
 </div>
 </section>
 ) : null}
 </Drawer.Body>
 </Drawer.Dialog>
 </Drawer.Content>
 </Drawer.Backdrop>
 </Drawer>

 {item.sourceUrl ? <SourceLink url={item.sourceUrl} title="Open source" /> : null}
 </div>

 {allowDelete ? (
 <Button
 type="button"
 variant="danger-soft"
 size="sm"
 isDisabled={isDeleting}
 onClick={() => setDeleteConfirmOpen(true)}
 >
 {isDeleting ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
 Delete
 </Button>
 ) : null}
 </div>

 {allowDelete ? (
 <AlertDialog isOpen={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
 <AlertDialog.Backdrop variant="blur" isDismissable={false} className="bg-background/75">
 <AlertDialog.Container placement="center" size="xs" className="w-full max-w-none px-4">
 <AlertDialog.Dialog className="w-full max-w-sm rounded-surface border border-border bg-overlay p-5 text-foreground outline-none">
 <AlertDialog.Header className="flex flex-col items-start gap-1.5 text-left">
 <AlertDialog.Heading className="text-base font-medium">Delete this knowledge item?</AlertDialog.Heading>
 </AlertDialog.Header>
 <p slot="description" className="text-sm text-pretty text-muted">This permanently removes &ldquo;{item.title}&rdquo; from your memory. It will no longer appear in knowledge or search results.</p>
 <AlertDialog.Footer className="-mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 rounded-b-surface border-t border-border/70 bg-surface-soft/60 p-5 sm:flex-row sm:justify-end">
 <Button slot="close" variant="outline">Cancel</Button>
 <Button slot="close" variant="danger-soft" onClick={() => void runDelete()} isDisabled={isDeleting}>Delete knowledge item</Button>
 </AlertDialog.Footer>
 </AlertDialog.Dialog>
 </AlertDialog.Container>
 </AlertDialog.Backdrop>
 </AlertDialog>
 ) : null}
 </article>
 );
}

export function KnowledgeItemCardList({
 items,
 emptyTitle,
 previewMax,
 allowDelete = true,
}: {
 items: KnowledgeItemCardData[];
 emptyTitle: string;
 previewMax?: number;
 allowDelete?: boolean;
}) {
 if (items.length === 0) {
 return (
 <div className="rounded-2xl border border-dashed border-border/80 px-5 py-8 text-center text-sm text-muted">
 {emptyTitle}
 </div>
 );
 }

 return (
 <div className="space-y-3">
 {items.map((item) => (
 <KnowledgeItemCard
 key={item.id}
 item={item}
 previewMax={previewMax}
 allowDelete={allowDelete}
 />
 ))}
 </div>
 );
}
