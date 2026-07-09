"use client";

import { KnowledgeChatPanel } from "@/components/KnowledgeChatPanel";

/** Embedded ask-memory panel (e.g. on the Knowledge page). Prefer the global widget. */
export function KnowledgeChat({ initialQuestion = "" }: { initialQuestion?: string }) {
  return (
    <div className="card flex max-h-[min(60vh,520px)] min-h-[320px] flex-col overflow-hidden">
      <KnowledgeChatPanel
        pendingQuestion={initialQuestion || null}
        messagesClassName="max-h-[min(50vh,420px)]"
      />
    </div>
  );
}
