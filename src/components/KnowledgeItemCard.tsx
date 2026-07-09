"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import type { KnowledgeItemType } from "@/domain/knowledgeItem";
import type { SourceType } from "@/domain/sourceItem";
import { SourceBadge } from "@/components/SourceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
      toast.success("Knowledge item removed.");
      router.refresh();
    } catch {
      toast.error("Could not delete knowledge item. Try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <article className="card overflow-hidden" id={`knowledge-${item.id}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline">{TYPE_LABEL[item.type]}</Badge>
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
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="outline" size="sm">
                  Read more
                </Button>
              }
            />
            <SheetContent side="right" className="max-w-xl">
              <SheetHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{TYPE_LABEL[item.type]}</Badge>
                  {item.sourceType ? <SourceBadge sourceType={item.sourceType} /> : null}
                </div>
                <SheetTitle>{item.title}</SheetTitle>
                <SheetDescription>
                  {[item.projectName, formatItemDate(displayDate)].filter(Boolean).join(" · ")}
                </SheetDescription>
              </SheetHeader>

              <SheetBody className="space-y-6">
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
              </SheetBody>
            </SheetContent>
          </Sheet>

          {item.sourceUrl ? <SourceLink url={item.sourceUrl} title="Open source" /> : null}
        </div>

        {allowDelete ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isDeleting}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            {isDeleting ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
            Delete
          </Button>
        ) : null}
      </div>

      {allowDelete ? (
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this knowledge item?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes &ldquo;{item.title}&rdquo; from your memory. It will no
                longer appear in knowledge or search results.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void runDelete()}
                disabled={isDeleting}
              >
                Delete knowledge item
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
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
