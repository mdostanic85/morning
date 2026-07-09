"use client";

import React, { useState } from "react";
import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

export interface QueueTab {
  id: string;
  label: string;
  description?: string;
  count: number;
  /** Unclear gets a visually distinct warning treatment. */
  unclear?: boolean;
  content: ReactNode;
}

export function TodayQueueTabs({
  tabs,
  trailing,
}: {
  tabs: QueueTab[];
  trailing?: React.ReactNode;
}) {
  const visibleTabs = tabs.filter((tab) => tab.count > 0);
  const [activeId, setActiveId] = useState(visibleTabs[0]?.id ?? "");

  if (visibleTabs.length === 0) return null;

  // A single category isn't a choice — showing it as a tab (with an active
  // underline stretched across the whole row) reads as a rendering bug.
  // Fall back to a plain heading instead.
  if (visibleTabs.length === 1) {
    const tab = visibleTabs[0];
    return (
      <section aria-label={tab.label}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className={cn("eyebrow", tab.unclear ? "text-unclear" : "text-muted-soft")}>
            {tab.label}
            <span className="ml-1.5 font-normal opacity-60">{tab.count}</span>
          </h2>
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
        {tab.description ? (
          <p className="mt-2 mb-4 text-sm leading-relaxed text-muted">{tab.description}</p>
        ) : null}
        <div className="space-y-5">{tab.content}</div>
      </section>
    );
  }

  return (
    <section aria-label="Rest of the queue">
      <Tabs
        value={activeId}
        onValueChange={(v) => {
          if (v !== null) setActiveId(v);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
        <TabsList variant="line" className="flex-wrap">
          {visibleTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                tab.unclear
                  ? "text-unclear/80 data-active:text-unclear"
                  : undefined
              )}
            >
              {tab.label}
              <span className="tabular-nums text-xs font-normal opacity-60">
                {tab.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {trailing ? (
          <div className="shrink-0">{trailing}</div>
        ) : null}
        </div>

        {visibleTabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {tab.description ? (
                <p className="mb-4 text-sm leading-relaxed text-muted">{tab.description}</p>
              ) : null}
              <div className="space-y-5">{tab.content}</div>
            </motion.div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
