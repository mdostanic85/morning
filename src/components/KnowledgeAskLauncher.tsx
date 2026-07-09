"use client";

import { MessageCircleIcon } from "lucide-react";
import { useAskMemory } from "@/components/AskMemoryWidget";
import { Button } from "@/components/ui/button";

export function KnowledgeAskLauncher() {
  const { open } = useAskMemory();

  return (
    <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <p className="eyebrow">Ask memory</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Open the chat widget to ask questions grounded in your ingested sources — available on
          every page.
        </p>
      </div>
      <Button type="button" onClick={() => open()} className="shrink-0 gap-2">
        <MessageCircleIcon className="size-4" aria-hidden />
        Open chat
      </Button>
    </div>
  );
}
