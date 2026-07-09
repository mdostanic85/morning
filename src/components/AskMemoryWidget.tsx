"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Maximize2Icon,
  MessageCircleIcon,
  Minimize2Icon,
  XIcon,
} from "lucide-react";
import { KnowledgeChatPanel } from "@/components/KnowledgeChatPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AskMemoryContextValue {
  isOpen: boolean;
  isExpanded: boolean;
  open: (question?: string) => void;
  close: () => void;
  toggle: () => void;
  toggleExpanded: () => void;
}

const AskMemoryContext = createContext<AskMemoryContextValue | null>(null);

export function useAskMemory(): AskMemoryContextValue {
  const context = useContext(AskMemoryContext);
  if (!context) {
    throw new Error("useAskMemory must be used within AskMemoryProvider");
  }
  return context;
}

function AskMemoryWidgetPanel({
  expanded,
  open,
  onClose,
  onToggleExpanded,
  pendingQuestion,
  onPendingQuestionConsumed,
}: {
  expanded: boolean;
  open: boolean;
  onClose: () => void;
  onToggleExpanded: () => void;
  pendingQuestion: string | null;
  onPendingQuestionConsumed: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Ask memory"
      aria-hidden={!open}
      className={cn(
        "fixed z-40 flex min-w-0 flex-col overflow-hidden rounded-surface border border-border-strong/80 bg-surface shadow-soft backdrop-blur-xl transition-all duration-300 ease-out",
        !open && "pointer-events-none translate-y-2 scale-[0.98] opacity-0",
        expanded
          ? "inset-3 sm:inset-auto sm:right-5 sm:top-24 sm:bottom-5 sm:w-[min(720px,calc(100vw-2.5rem))]"
          : "right-3 bottom-3 h-[min(560px,calc(100vh-6rem))] w-[min(400px,calc(100vw-1.5rem))] sm:right-5 sm:bottom-5"
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold tracking-tight">Ask memory</p>
          <p className="truncate text-[12px] text-muted">
            Grounded in your sources — no outside guesses.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleExpanded}
            aria-label={expanded ? "Make chat smaller" : "Expand chat"}
          >
            {expanded ? (
              <Minimize2Icon className="size-4" aria-hidden />
            ) : (
              <Maximize2Icon className="size-4" aria-hidden />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close ask memory"
          >
            <XIcon className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      <KnowledgeChatPanel
        pendingQuestion={pendingQuestion}
        onPendingQuestionConsumed={onPendingQuestionConsumed}
        showHeader={false}
        className="min-h-0 flex-1"
      />
    </div>
  );
}

function AskMemoryWidgetFab({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? "Close ask memory" : "Open ask memory"}
      aria-expanded={isOpen}
      className={cn(
        "fixed z-40 size-14 rounded-full shadow-soft transition-all duration-300",
        isOpen
          ? "pointer-events-none bottom-3 right-3 scale-0 opacity-0 sm:bottom-5 sm:right-5"
          : "bottom-5 right-5 scale-100 opacity-100"
      )}
    >
      <MessageCircleIcon className="size-5" aria-hidden />
    </Button>
  );
}

export function AskMemoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const open = useCallback((question?: string) => {
    setIsOpen(true);
    if (question?.trim()) {
      setPendingQuestion(question.trim());
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((current) => !current);
  }, []);

  const clearPendingQuestion = useCallback(() => {
    setPendingQuestion(null);
  }, []);

  const isKnowledgePage = pathname === "/knowledge" || pathname.startsWith("/knowledge/");

  useEffect(() => {
    if (isKnowledgePage) {
      setIsOpen(false);
      return;
    }
    const question = searchParams.get("q")?.trim();
    if (question) {
      open(question);
    }
  }, [isKnowledgePage, searchParams, open]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const value = useMemo(
    () => ({
      isOpen,
      isExpanded,
      open,
      close,
      toggle,
      toggleExpanded,
    }),
    [isOpen, isExpanded, open, close, toggle, toggleExpanded]
  );

  return (
    <AskMemoryContext.Provider value={value}>
      {children}
      {!isKnowledgePage ? (
        <>
          <AskMemoryWidgetFab onClick={toggle} isOpen={isOpen} />
          <AskMemoryWidgetPanel
            open={isOpen}
            expanded={isExpanded}
            onClose={close}
            onToggleExpanded={toggleExpanded}
            pendingQuestion={pendingQuestion}
            onPendingQuestionConsumed={clearPendingQuestion}
          />
        </>
      ) : null}
    </AskMemoryContext.Provider>
  );
}
