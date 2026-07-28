"use client";

import { useMemo, useState } from "react";
import type { KnowledgeItemCardData } from "@/components/KnowledgeItemCard";
import { KnowledgeItemCardList } from "@/components/KnowledgeItemCard";
import { KNOWLEDGE_MAX_AGE_DAYS, filterKnowledgeByQuery } from "@/lib/filters/knowledgeFilter";
import { Input } from "@heroui/react/input";
import { Button } from "@heroui/react/button";
import type { KnowledgeItemType } from "@/domain/knowledgeItem";

interface KnowledgeFilteredViewProps {
  items: KnowledgeItemCardData[];
  myName: string | null;
}

const PAGE_SIZE = 10;

const TYPE_LABEL: Record<KnowledgeItemType, string> = {
  requirement: "Requirements",
  decision: "Decisions",
  open_question: "Open questions",
  risk: "Risks",
  deadline: "Deadlines",
  stakeholder_preference: "Stakeholder preferences",
  acceptance_criteria: "Acceptance criteria",
};

function normalizeWords(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

function similarity(left: string, right: string): number {
  const a = normalizeWords(left);
  const b = normalizeWords(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) {
    if (b.has(word)) shared += 1;
  }
  return shared / new Set([...a, ...b]).size;
}

function collapseDisplayDuplicates(items: KnowledgeItemCardData[]): KnowledgeItemCardData[] {
  const kept: KnowledgeItemCardData[] = [];
  for (const item of items) {
    const duplicate = kept.some(
      (candidate) =>
        candidate.type === item.type &&
        candidate.sourceUrl === item.sourceUrl &&
        (similarity(candidate.title, item.title) >= 0.72 ||
          similarity(candidate.content, item.content) >= 0.86)
    );
    if (!duplicate) kept.push(item);
  }
  return kept;
}

export function KnowledgeFilteredView({ items, myName }: KnowledgeFilteredViewProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<KnowledgeItemType | "all">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const queryMatches = useMemo(() => filterKnowledgeByQuery(items, query), [items, query]);
  const typeMatches = useMemo(
    () => queryMatches.filter((item) => type === "all" || item.type === type),
    [queryMatches, type]
  );
  const collapsedItems = useMemo(() => collapseDisplayDuplicates(typeMatches), [typeMatches]);
  const filteredItems = showDuplicates ? typeMatches : collapsedItems;
  const visibleItems = filteredItems.slice(0, visibleCount);
  const hiddenDuplicateCount = typeMatches.length - collapsedItems.length;

  const emptyTitle = query.trim()
    ? "No learnings match your search."
    : type === "all"
      ? "No recent learnings for you."
      : `No ${TYPE_LABEL[type].toLocaleLowerCase()} found.`;

  function updateQuery(value: string) {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  }

  function updateType(value: KnowledgeItemType | "all") {
    setType(value);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_auto] md:items-center">
        <Input
          type="search"
          fullWidth
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="Search learnings"
          aria-label="Search knowledge"
          className="h-11 max-w-md border border-border bg-background/70 text-sm shadow-none"
        />
        <select
          value={type}
          onChange={(event) => updateType(event.target.value as KnowledgeItemType | "all")}
          aria-label="Filter by learning type"
          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <p className="text-metadata text-muted-soft">
          Last {KNOWLEDGE_MAX_AGE_DAYS} days
          {myName ? ", relevant to you" : ""}
          {". "}
          <span className="tabular-nums text-muted">{filteredItems.length}</span>
        </p>
      </div>

      {hiddenDuplicateCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface-soft/50 px-4 py-3 text-sm text-muted">
          <span>
            {hiddenDuplicateCount} similar {hiddenDuplicateCount === 1 ? "item is" : "items are"} grouped.
          </span>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              setShowDuplicates((value) => !value);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            {showDuplicates ? "Group similar items" : "Show every item"}
          </Button>
        </div>
      ) : null}

      <KnowledgeItemCardList items={visibleItems} emptyTitle={emptyTitle} />

      {visibleCount < filteredItems.length ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-36"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, filteredItems.length - visibleCount)} more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
