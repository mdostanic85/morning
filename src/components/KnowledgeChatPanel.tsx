"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import type { KnowledgeAnswer, KnowledgeAnswerSource } from "@/lib/knowledge/qa";
import { SourceBadge } from "@/components/SourceBadge";
import type { SourceType } from "@/domain/sourceItem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer?: KnowledgeAnswer;
}

function formatSourceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function AnswerSources({ sources }: { sources: KnowledgeAnswerSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <p className="eyebrow text-muted-soft">From your memory</p>
      <ul className="mt-2 space-y-3">
        {sources.map((source) => (
          <li key={`${source.title}-${source.excerpt.slice(0, 24)}`} className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {source.sourceType ? (
                <SourceBadge sourceType={source.sourceType as SourceType} />
              ) : null}
              {source.href ? (
                source.external ? (
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-accent hover:underline"
                  >
                    <span className="truncate">{source.title}</span>
                    <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
                  </a>
                ) : (
                  <Link
                    href={source.href}
                    className="truncate text-[13px] font-medium text-accent hover:underline"
                  >
                    {source.title}
                  </Link>
                )
              ) : (
                <span className="truncate text-[13px] font-medium text-foreground">{source.title}</span>
              )}
              <span className="text-[12px] text-muted-soft">{formatSourceDate(source.sourceDate)}</span>
            </div>
            <p className="mt-1.5 break-words text-[13px] leading-relaxed text-muted italic">
              &ldquo;{source.excerpt}&rdquo;
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssistantMessage({ answer }: { answer: KnowledgeAnswer }) {
  if (!answer.ok) {
    return (
      <p className="break-words text-sm leading-relaxed text-destructive">
        {answer.error ?? "Could not generate an answer."}
      </p>
    );
  }

  return (
    <div className="min-w-0 max-w-full">
      <p
        className={cn(
          "break-words whitespace-pre-line text-sm leading-relaxed",
          answer.canAnswer ? "text-foreground" : "text-muted"
        )}
      >
        {answer.answer}
      </p>
      {answer.canAnswer ? <AnswerSources sources={answer.sources} /> : null}
    </div>
  );
}

export interface KnowledgeChatPanelProps {
  pendingQuestion?: string | null;
  onPendingQuestionConsumed?: () => void;
  className?: string;
  messagesClassName?: string;
  showHeader?: boolean;
}

export function KnowledgeChatPanel({
  pendingQuestion = null,
  onPendingQuestionConsumed,
  className,
  messagesClassName,
  showHeader = true,
}: KnowledgeChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function askQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setError(null);
    setLoading(true);
    setInput("");

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      const payload = (await response.json()) as KnowledgeAnswer & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Knowledge search failed.");
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: payload.answer,
        answer: payload,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Knowledge search failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const trimmed = pendingQuestion?.trim();
    if (!trimmed) return;
    void askQuestion(trimmed);
    onPendingQuestionConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per pendingQuestion value from parent
  }, [pendingQuestion]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}>
      {showHeader ? (
        <div className="shrink-0 border-b border-border/70 px-5 py-4 sm:px-6">
          <p className="eyebrow">Ask memory</p>
          <p className="mt-1 text-sm text-muted">
            Answers use only your ingested sources — no outside guesses.
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4 sm:px-6",
          messagesClassName
        )}
      >
        {messages.length === 0 && !loading ? (
          <p className="text-sm text-muted">Ask a direct question about your work memory.</p>
        ) : (
          <div className="space-y-4">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[92%] min-w-0 break-words rounded-2xl bg-surface-soft px-4 py-3 text-sm leading-relaxed">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={message.id} className="min-w-0 max-w-full">
                  {message.answer ? <AssistantMessage answer={message.answer} /> : null}
                </div>
              )
            )}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2Icon className="size-4 shrink-0 animate-spin" aria-hidden />
                Thinking…
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
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Your question…"
            disabled={loading}
            aria-label="Ask memory"
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={loading || !input.trim()} className="shrink-0">
            Ask
          </Button>
        </div>
        {error ? (
          <p className="mt-2 break-words text-sm text-destructive">{error}</p>
        ) : null}
      </form>
    </section>
  );
}
