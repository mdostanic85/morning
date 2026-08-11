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
  Minimize2Icon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { TaskChatPanel } from "@/components/TaskChatPanel";
import { Button } from "@heroui/react/button";
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

/** The single gradient treatment in the assistant UI. */
const AI_GRADIENT =
  "linear-gradient(135deg, var(--gradient-magenta), var(--gradient-violet) 28%, var(--gradient-indigo) 52%, var(--gradient-blue) 74%, var(--gradient-cyan))";

export function useAskMemory(): AskMemoryContextValue {
  const context = useContext(AskMemoryContext);
  if (!context) {
    throw new Error("useAskMemory must be used within AskMemoryProvider");
  }
  return context;
}

/** Gradient sparkle avatar — the assistant's identity mark. */
export function AssistantMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-white shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--gradient-violet)_60%,transparent)]",
        className
      )}
      style={{ backgroundImage: AI_GRADIENT }}
      aria-hidden
    >
      <SparklesIcon className="size-1/2" />
    </span>
  );
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
      aria-label="Work assistant"
      aria-hidden={!open}
      className={cn(
        "fixed z-40 flex min-w-0 flex-col overflow-hidden rounded-surface border border-border-strong/70 bg-surface/95 shadow-[0_28px_70px_-30px_rgba(11,47,103,0.45)] backdrop-blur-xl transition-all duration-300 ease-out",
        !open && "pointer-events-none translate-y-3 scale-[0.98] opacity-0",
        expanded
          ? "inset-3 sm:inset-auto sm:right-5 sm:top-24 sm:bottom-5 sm:w-[min(760px,calc(100vw-2.5rem))]"
          : [
              // Docked size. Below md it clears the bottom nav the same way the
              // launcher does, and dvh keeps it inside the visible viewport
              // while mobile browser chrome slides in and out.
              "right-3 w-[min(420px,calc(100vw-1.5rem))]",
              "bottom-[calc(5.25rem+env(safe-area-inset-bottom))] h-[min(600px,calc(100dvh-12rem))]",
              "md:bottom-5 md:right-5 md:h-[min(600px,calc(100dvh-5rem))]",
            ]
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <AssistantMark className="size-10" />
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold tracking-tight">Work assistant</p>
            <p className="truncate text-[14px] text-muted">
              Answers with sources and clear uncertainty.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            isIconOnly
            className="size-11 p-0"
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
            size="sm"
            isIconOnly
            className="size-11 p-0"
            onClick={onClose}
            aria-label="Close work assistant"
          >
            <XIcon className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      <TaskChatPanel
        pendingQuestion={pendingQuestion}
        onPendingQuestionConsumed={onPendingQuestionConsumed}
        className="min-h-0 flex-1"
      />
    </div>
  );
}

function AskMemoryWidgetFab({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? "Close work assistant" : "Open work assistant"}
      aria-expanded={isOpen}
      className={cn(
        "group fixed z-40 flex h-14 items-center gap-2.5 rounded-full bg-action-primary pl-2 pr-2 text-action-primary-foreground shadow-[0_16px_38px_-14px_color-mix(in_srgb,var(--action-primary)_65%,transparent)] transition-all duration-300 ease-out hover:-translate-y-0.5 sm:pr-5",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]",
        // Below md the bottom dock owns the bottom edge, so the button rides
        // above it instead of covering the last nav item.
        "bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 md:bottom-5 md:right-5",
        isOpen ? "pointer-events-none scale-0 opacity-0" : "scale-100 opacity-100"
      )}
    >
      <span className="grid size-10 place-items-center rounded-full bg-white/15">
        <SparklesIcon className="size-5" aria-hidden />
      </span>
      <span className="hidden pr-1 text-[15px] font-semibold tracking-tight sm:block">
        Ask
      </span>
    </button>
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

  // The assistant is available on every route. A deep link with ?q= opens it
  // with the question pre-filled.
  useEffect(() => {
    const question = searchParams.get("q")?.trim();
    if (!question) return;
    // Defer so state updates don't run synchronously inside the effect body.
    const timer = setTimeout(() => open(question), 0);
    return () => clearTimeout(timer);
  }, [pathname, searchParams, open]);

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
      <AskMemoryWidgetFab onClick={toggle} isOpen={isOpen} />
      <AskMemoryWidgetPanel
        open={isOpen}
        expanded={isExpanded}
        onClose={close}
        onToggleExpanded={toggleExpanded}
        pendingQuestion={pendingQuestion}
        onPendingQuestionConsumed={clearPendingQuestion}
      />
    </AskMemoryContext.Provider>
  );
}
