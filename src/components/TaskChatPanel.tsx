"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { SourceBadge } from "@/components/SourceBadge";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import type { SourceType } from "@/domain/sourceItem";
import type {
  TaskChatOption,
  TaskQaAnswer,
  TaskQaAnswerSource,
} from "@/lib/tasks/taskQa";
import { cn } from "@/lib/utils";
import styles from "./TaskChatPanel.module.css";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer?: TaskQaAnswer;
}

const SUGGESTED_QUESTIONS = [
  "What exactly do I need to do?",
  "What was most recently agreed?",
  "What are the requirements and done criteria?",
  "Are any sources conflicting?",
];

const GENERAL_SUGGESTED_QUESTIONS = [
  "What changed most recently?",
  "What should I pay attention to today?",
  "Are there any conflicting instructions?",
  "What is still unclear?",
];

function AssistantAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent-soft-surface text-accent-strong",
        className
      )}
      aria-hidden
    >
      <SparklesIcon className="size-1/2" />
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      <span className={styles["chat-typing-dot"]} />
      <span className={styles["chat-typing-dot"]} style={{ animationDelay: "160ms" }} />
      <span className={styles["chat-typing-dot"]} style={{ animationDelay: "320ms" }} />
    </span>
  );
}

function formatSourceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sourceRoleLabel(source: TaskQaAnswerSource): string | null {
  if (source.sourceRole === "gemini_transcript") return "Latest direction";
  if (source.sourceRole === "jira_issue_with_comments") return "Task record";
  return null;
}

function AnswerList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <p className="text-[14px] font-semibold uppercase tracking-[0.14em] text-muted-soft">
        {title}
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-relaxed text-foreground">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AnswerSources({ sources }: { sources: TaskQaAnswerSource[] }) {
  if (sources.length === 0) return null;

  return (
    <details className="group border-t border-border/60 pt-3">
      <summary className="cursor-pointer list-none text-[14px] font-medium text-muted hover:text-foreground">
        Based on {sources.length} synced {sources.length === 1 ? "source" : "sources"}
      </summary>
      <ul className="mt-3 space-y-3">
        {sources.map((source) => {
          const roleLabel = sourceRoleLabel(source);
          return (
            <li key={source.id} className="rounded-xl border border-border/60 bg-surface-soft/60 p-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <SourceBadge sourceType={source.sourceType as SourceType} />
                {roleLabel ? (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[14px] font-semibold uppercase tracking-wide text-accent">
                    {roleLabel}
                  </span>
                ) : null}
                <span className="text-[14px] text-muted-soft">{formatSourceDate(source.sourceDate)}</span>
              </div>
              <div className="mt-2 flex min-w-0 items-start justify-between gap-2">
                <p className="min-w-0 break-words text-[14px] font-medium text-foreground">
                  {source.title}
                </p>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${source.title}`}
                    className="shrink-0 text-muted hover:text-accent"
                  >
                    <ExternalLinkIcon className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </div>
              <p className="mt-1.5 break-words text-[14px] leading-relaxed text-muted">
                {source.excerpt}
              </p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** The API prefixes failures with a raw error kind (e.g. "missing_api_key:").
 *  Turn that into calm, actionable copy — with a Settings link where relevant. */
function humanizeAnswerError(raw: string): { message: string; settingsLink: boolean } {
  const match = raw.match(/^([a-z0-9_]+):\s*([\s\S]*)$/i);
  const kind = match?.[1] ?? "";
  const rest = (match?.[2] ?? raw).trim();

  if (kind === "missing_api_key" || /no active llm providers/i.test(raw)) {
    return {
      message: "No AI provider is turned on yet. Enable at least one provider so the assistant can answer.",
      settingsLink: true,
    };
  }
  if (kind === "rate_limit" || /rate limit/i.test(raw)) {
    return {
      message: "The AI provider hit its rate limit. Try again in a moment or switch provider in Settings.",
      settingsLink: true,
    };
  }
  if (kind === "quota" || /quota|billing/i.test(raw)) {
    return {
      message: "The AI provider's quota or billing is exceeded. Restore credits or switch provider in Settings.",
      settingsLink: true,
    };
  }
  if (
    /reduce the length of the messages/i.test(raw) ||
    /context[_ ]?(length|window)|maximum context|too many tokens|prompt is too long|input is too long/i.test(
      raw
    )
  ) {
    return {
      message:
        "There's too much synced context for this question. Focus on a specific task, or ask something narrower.",
      settingsLink: false,
    };
  }
  return { message: rest || "The assistant couldn't answer that. Please try again.", settingsLink: false };
}

function AnswerError({ error }: { error: string }) {
  const { message, settingsLink } = humanizeAnswerError(error);
  return (
    <div className="rounded-2xl border border-danger/25 bg-danger-soft-surface/60 p-3.5">
      <p className="text-sm leading-relaxed text-foreground">{message}</p>
      {settingsLink ? (
        <Link
          href="/settings"
          className="mt-3 inline-flex h-9 items-center rounded-full bg-action-primary px-3.5 text-[14px] font-semibold text-action-primary-foreground"
        >
          Open Settings
        </Link>
      ) : null}
    </div>
  );
}

function StructuredAnswer({ answer }: { answer: TaskQaAnswer }) {
  if (!answer.ok) {
    return <AnswerError error={answer.error ?? "The assistant couldn't answer that."} />;
  }

  const confidence = Math.round(answer.confidence * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[14px] font-semibold uppercase tracking-[0.12em]",
            answer.canAnswer
              ? "bg-good/10 text-good"
              : "bg-waiting/10 text-waiting"
          )}
        >
          {answer.canAnswer ? `${confidence}% grounded` : "Not enough evidence"}
        </span>
      </div>

      <p
        className={cn(
          "break-words whitespace-pre-line text-sm leading-relaxed",
          answer.canAnswer ? "text-foreground" : "text-muted"
        )}
      >
        {answer.directAnswer ||
          "I cannot answer this confidently from the synced task context yet."}
      </p>

      <AnswerList title="What we know" items={answer.whatWeKnow} />
      <AnswerList title="What to do" items={answer.whatToDo} />
      <AnswerList title="Requirements" items={answer.requirements} />
      <AnswerList title="Still unclear" items={answer.uncertainties} />
      <AnswerSources sources={answer.sources} />
    </div>
  );
}

function TaskFocusList({
  tasks,
  loading,
  error,
  onSelect,
}: {
  tasks: TaskChatOption[];
  loading: boolean;
  error: string | null;
  onSelect: (task: TaskChatOption) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tasks;
    return tasks.filter((task) =>
      `${task.title} ${task.projectName ?? ""} ${task.nextAction}`.toLowerCase().includes(normalized)
    );
  }, [query, tasks]);

  return (
    <div className="mt-4 rounded-2xl border border-border/70 bg-surface-soft/40 p-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-soft" aria-hidden />
        <Input
          fullWidth
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a task to focus on…"
          aria-label="Find a task"
          className={cn("h-11 border border-border bg-background/70 pl-9 text-sm shadow-none")}
        />
      </div>

      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-0.5">
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            Loading your tasks…
          </div>
        ) : error ? (
          <p className="py-4 text-sm text-danger">{error}</p>
        ) : filteredTasks.length === 0 ? (
          <p className="py-4 text-sm text-muted">
            {tasks.length === 0 ? "No active tasks were found." : "No tasks match that search."}
          </p>
        ) : (
          filteredTasks.map((task) => (
            <Button
              key={task.id}
              type="button"
              variant="ghost"
              onPress={() => onSelect(task)}
              className="h-auto w-full justify-start rounded-xl border border-border/70 bg-surface p-3 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
            >
              <div className="flex w-full items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {task.title}
                </span>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[14px] font-medium uppercase tracking-wide text-muted">
                  {task.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-1 w-full text-left text-[14px] text-muted-soft">
                {task.projectName ?? "No project"}
              </p>
            </Button>
          ))
        )}
      </div>
    </div>
  );
}

export interface TaskChatPanelProps {
  pendingQuestion?: string | null;
  onPendingQuestionConsumed?: () => void;
  className?: string;
}

type ChatScope = TaskChatOption | "all" | null;

export function TaskChatPanel({
  pendingQuestion = null,
  onPendingQuestionConsumed,
  className,
}: TaskChatPanelProps) {
  const [tasks, setTasks] = useState<TaskChatOption[]>([]);
  const [scope, setScope] = useState<ChatScope>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTaskFocus, setShowTaskFocus] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTasks() {
      try {
        const response = await fetch("/api/task-chat/tasks");
        const payload = (await response.json()) as { tasks?: TaskChatOption[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load tasks.");
        if (!cancelled) setTasks(payload.tasks ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load tasks.");
      } finally {
        if (!cancelled) setLoadingTasks(false);
      }
    }
    void loadTasks();
    return () => {
      cancelled = true;
    };
  }, []);

  async function askQuestion(
    question: string,
    scopeOverride?: Exclude<ChatScope, null>
  ) {
    const trimmed = question.trim();
    const activeScope = scopeOverride ?? scope ?? "all";
    if (!trimmed || loadingAnswer) return;
    if (!scope) setScope(activeScope);

    setError(null);
    setLoadingAnswer(true);
    setInput("");
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: trimmed },
    ]);

    try {
      const response = await fetch("/api/task-chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(activeScope === "all" ? {} : { taskId: activeScope.id }),
          question: trimmed,
        }),
      });
      const payload = (await response.json()) as TaskQaAnswer & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not answer that question.");
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.directAnswer,
          answer: payload,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not answer that question.");
    } finally {
      setLoadingAnswer(false);
    }
  }

  useEffect(() => {
    const trimmed = pendingQuestion?.trim();
    if (!trimmed) return;
    const timeoutId = window.setTimeout(() => {
      void askQuestion(trimmed, scope ?? "all");
      onPendingQuestionConsumed?.();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consume each parent question once
  }, [pendingQuestion]);

  useEffect(() => {
    if (messages.length === 0 && !loadingAnswer) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingAnswer]);

  function selectTask(task: TaskChatOption) {
    setScope(task);
    setMessages([]);
    setError(null);
    setShowTaskFocus(false);
  }

  function resetToStart() {
    setScope(null);
    setMessages([]);
    setInput("");
    setError(null);
    setShowTaskFocus(false);
  }

  const selectedTask = scope && scope !== "all" ? scope : null;
  const suggestedQuestions = selectedTask ? SUGGESTED_QUESTIONS : GENERAL_SUGGESTED_QUESTIONS;
  const hasThread = messages.length > 0 || loadingAnswer;

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}>
      {/* Scope bar — only once a conversation is scoped to a specific task. */}
      {selectedTask ? (
        <div className="shrink-0 border-b border-border/70 px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onPress={resetToStart}
            className="mb-2 px-0 text-[14px] font-medium text-muted hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" aria-hidden />
            Ask across all work
          </Button>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {selectedTask.title}
              </p>
              <p className="mt-0.5 truncate text-[14px] text-muted-soft">
                {selectedTask.projectName ?? "No project"}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[14px] font-medium uppercase tracking-wide text-muted">
              {selectedTask.status.replaceAll("_", " ")}
            </span>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
        {!hasThread ? (
          <div>
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">
                {selectedTask ? "Ask about this task" : "How can I help with your work?"}
              </p>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">
                {selectedTask
                  ? "I answer only from this task's synced context and flag anything uncertain."
                  : "I search across your synced sources and flag anything uncertain."}
              </p>
            </div>

            <div className="mt-5 grid gap-2">
              {suggestedQuestions.map((question) => (
                <Button
                  key={question}
                  type="button"
                  variant="ghost"
                  onPress={() => void askQuestion(question)}
                  className="h-auto w-full min-w-0 justify-start whitespace-normal rounded-2xl border border-border/70 bg-surface-soft/40 px-3.5 py-3 text-left text-[14px] text-foreground transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
                >
                  {question}
                </Button>
              ))}
            </div>

            {!selectedTask ? (
              <div className="mt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowTaskFocus((current) => !current)}
                  aria-expanded={showTaskFocus}
                  className="min-h-11 px-0 text-[14px] font-medium text-muted hover:text-foreground"
                >
                  <SlidersHorizontalIcon className="size-3.5" aria-hidden />
                  {showTaskFocus ? "Hide task focus" : "Focus on a specific task"}
                </Button>
                {showTaskFocus ? (
                  <TaskFocusList
                    tasks={tasks}
                    loading={loadingTasks}
                    error={error}
                    onSelect={selectTask}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] break-words rounded-2xl rounded-br-md bg-surface-soft px-4 py-2.5 text-sm leading-relaxed">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={message.id} className="flex min-w-0 gap-3">
                  <AssistantAvatar className="mt-0.5 size-8" />
                  <div className="min-w-0 flex-1">
                    {message.answer ? <StructuredAnswer answer={message.answer} /> : null}
                  </div>
                </div>
              )
            )}
            {loadingAnswer ? (
              <div className="flex min-w-0 items-center gap-3">
                <AssistantAvatar className="size-8" />
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-surface-soft px-4 py-3">
                  <TypingDots />
                  <span className="text-[14px] text-muted">Checking your sources…</span>
                </div>
              </div>
            ) : null}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="shrink-0 border-t border-border/70 p-3 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void askQuestion(input);
        }}
      >
        <div
          className={cn(
            styles["chat-composer"],
            "flex min-w-0 items-end gap-2 rounded-full border border-border bg-background/70 py-1 pl-4 pr-1.5 transition-[border-color,box-shadow] duration-150"
          )}
          data-chat-composer
        >
          <Input
            fullWidth
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={selectedTask ? "Ask about this task…" : "Ask anything about your work…"}
            disabled={loadingAnswer}
            aria-label={selectedTask ? "Ask about selected task" : "Ask about synced work"}
            className={cn(
              "h-11 min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none ring-0 outline-none"
            )}
          />
          <Button
            type="submit"
            isIconOnly
            isDisabled={loadingAnswer || !input.trim()}
            aria-label="Send"
            className={cn(
              "chat-send size-11 shrink-0 bg-action-primary text-action-primary-foreground",
              styles["chat-send"]
            )}
          >
            <ArrowUpIcon className="size-4" aria-hidden />
          </Button>
        </div>
        {error && hasThread ? <p className="mt-2 px-1 text-sm text-danger">{error}</p> : null}
      </form>
    </section>
  );
}
