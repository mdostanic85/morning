"use client";

import { useMemo, useState } from "react";
import type { KnowledgeItemCardData } from "@/components/KnowledgeItemCard";
import { KnowledgeItemCardList } from "@/components/KnowledgeItemCard";
import { KNOWLEDGE_MAX_AGE_DAYS, filterKnowledgeByQuery } from "@/lib/filters/knowledgeFilter";
import { Input } from "@heroui/react/input";

interface KnowledgeFilteredViewProps {
  items: KnowledgeItemCardData[];
  myName: string | null;
}

export function KnowledgeFilteredView({ items, myName }: KnowledgeFilteredViewProps) {
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(
    () => filterKnowledgeByQuery(items, query),
    [items, query]
  );

  const emptyTitle = query.trim()
    ? "No learnings match your search."
    : "No recent learnings for you.";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          fullWidth
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search learnings…"
          aria-label="Search knowledge"
          className="h-11 max-w-md border border-border bg-background/70 text-sm shadow-none"
        />
        <p className="text-xs text-muted-soft">
          Last {KNOWLEDGE_MAX_AGE_DAYS} days
          {myName ? " · relevant to you" : ""}
          {" · "}
          <span className="tabular-nums text-muted">{filteredItems.length}</span>
        </p>
      </div>

      <KnowledgeItemCardList items={filteredItems} emptyTitle={emptyTitle} />
    </div>
  );
}
