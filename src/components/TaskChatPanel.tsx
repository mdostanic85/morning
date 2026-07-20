"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
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

function StructuredAnswer({ answer }: { answer: TaskQaAnswer }) {
  if (!answer.ok) {
    return <p className="text-sm leading-relaxed text-danger">{answer.error}</p>;
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

function TaskPicker({
  tasks,
  loading,
  error,
  onSelect,
  onAskGeneral,
}: {
  tasks: TaskChatOption[];
  loading: boolean;
  error: string | null;
  onSelect: (task: TaskChatOption) => void;
  onAskGeneral: (question: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [generalQuestion, setGeneralQuestion] = useState("");
  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tasks;
    return tasks.filter((task) =>
      `${task.title} ${task.projectName ?? ""} ${task.nextAction}`.toLowerCase().includes(normalized)
    );
  }, [query, tasks]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pb-3 pt-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <SparklesIcon className="size-4" aria-hidden />
          </span>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">Ask about your work</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Ask across all synced sources, or choose a task for a more focused answer.
            </p>
          </div>
        </div>

        <form
          className="mt-4 flex min-w-0 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (generalQuestion.trim()) onAskGeneral(generalQuestion);
          }}
        >
          <Input
            fullWidth
            value={generalQuestion}
            onChange={(event) => setGeneralQuestion(event.target.value)}
            placeholder="Ask anything about your work…"
            aria-label="Ask across all synced work"
            className={cn("h-11 min-w-0 flex-1 border border-border bg-background/70 text-sm shadow-none")}
          />
          <Button type="submit" isDisabled={!generalQuestion.trim()} className="shrink-0">
            Ask
          </Button>
        </form>

        <p className="mt-5 text-[14px] font-semibold uppercase tracking-[0.14em] text-muted-soft">
          Or choose a task
        </p>
        <div className="relative mt-4">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-soft" aria-hidden />
          <Input
            fullWidth
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a task…"
            aria-label="Find a task"
            className={cn("h-11 border border-border bg-background/70 pl-9 text-sm shadow-none")}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            Loading your tasks…
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-danger">{error}</p>
        ) : filteredTasks.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            {tasks.length === 0 ? "No active tasks were found." : "No tasks match that search."}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <Button
                key={task.id}
                type="button"
                variant="ghost"
                onPress={() => onSelect(task)}
                className="h-auto w-full justify-start rounded-xl border border-border/70 bg-surface-soft/40 p-3.5 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
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
                <p className="mt-2 w-full line-clamp-2 text-left text-[14px] leading-relaxed text-muted">
                  {task.nextAction}
                </p>
              </Button>
            ))}
          </div>
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
    const activeScope = scopeOverride ?? scope;
    if (!activeScope || !trimmed || loadingAnswer) return;

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
      const questionScope = scope ?? "all";
      if (!scope) setScope("all");
      void askQuestion(trimmed, questionScope);
      onPendingQuestionConsumed?.();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consume each parent question once
  }, [pendingQuestion]);

  useEffect(() => {
    if (!scope || (messages.length === 0 && !loadingAnswer)) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [scope, messages, loadingAnswer]);

  function selectTask(task: TaskChatOption) {
    setScope(task);
    setMessages([]);
    setError(null);
  }

  function askGeneralQuestion(question: string) {
    setScope("all");
    setMessages([]);
    setError(null);
    void askQuestion(question, "all");
  }

  function changeScope() {
    setScope(null);
    setMessages([]);
    setInput("");
    setError(null);
  }

  if (!scope) {
    return (
      <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}>
        <TaskPicker
          tasks={tasks}
          loading={loadingTasks}
          error={error}
          onSelect={selectTask}
          onAskGeneral={askGeneralQuestion}
        />
      </section>
    );
  }

  const selectedTask = scope === "all" ? null : scope;
  const suggestedQuestions = selectedTask
    ? SUGGESTED_QUESTIONS
    : GENERAL_SUGGESTED_QUESTIONS;

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="shrink-0 border-b border-border/70 px-4 py-3 sm:px-5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onPress={changeScope}
          className="mb-2 px-0 text-[14px] font-medium text-muted hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          Change scope
        </Button>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {selectedTask?.title ?? "All synced work"}
            </p>
            <p className="mt-0.5 truncate text-[14px] text-muted-soft">
              {selectedTask
                ? selectedTask.projectName ?? "No project"
                : "No project or task selected"}
            </p>
          </div>
          {selectedTask ? (
            <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[14px] font-medium uppercase tracking-wide text-muted">
              {selectedTask.status.replaceAll("_", " ")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
        {messages.length === 0 && !loadingAnswer ? (
          <div>
            <p className="text-sm font-medium text-foreground">What do you want to know?</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              {selectedTask
                ? "I will answer only from this task's synced context and flag anything uncertain."
                : "I will search across your synced work and flag anything uncertain."}
            </p>
            <div className="mt-4 grid gap-2">
              {suggestedQuestions.map((question) => (
                <Button
                  key={question}
                  type="button"
                  variant="ghost"
                  onPress={() => void askQuestion(question)}
                  className="h-auto w-full justify-start rounded-xl border border-border/70 bg-surface-soft/40 px-3.5 py-3 text-left text-[14px] text-foreground transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[90%] break-words rounded-2xl bg-surface-soft px-4 py-3 text-sm leading-relaxed">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={message.id} className="min-w-0 max-w-full">
                  {message.answer ? <StructuredAnswer answer={message.answer} /> : null}
                </div>
              )
            )}
            {loadingAnswer ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                Checking Jira, Confluence and transcripts…
              </div>
            ) : null}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="shrink-0 border-t border-border/70 p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void askQuestion(input);
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Input
            fullWidth
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={selectedTask ? "Ask about this task…" : "Ask about your work…"}
            disabled={loadingAnswer}
            aria-label={selectedTask ? "Ask about selected task" : "Ask about synced work"}
            className={cn("h-11 min-w-0 flex-1 border border-border bg-background/70 text-sm shadow-none")}
          />
          <Button type="submit" isDisabled={loadingAnswer || !input.trim()} className="shrink-0">
            Ask
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </form>
    </section>
  );
}
