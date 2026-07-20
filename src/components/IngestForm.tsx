"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { TextArea } from "@heroui/react/textarea";

const schema = z.object({
  title: z.string().optional(),
  content: z.string().min(1, "Paste some text to extract from."),
});

type FormValues = z.infer<typeof schema>;

type IngestMessage = {
  tone: "success" | "warning" | "error";
  text: string;
};

type ExtractionSummary =
  | { status: "completed"; tasks: number; evidence: number }
  | { status: "skipped"; reason: "duplicate_source" }
  | { status: "failed"; error: string };

type IngestResponse = {
  deduped: boolean;
  projectMatch?: {
    status: "matched" | "unassigned";
    projectId: number | null;
    projectName: string | null;
    confidence: number | null;
    matchedSignals: string[];
    reason: string;
    error?: string;
  };
  extraction?: ExtractionSummary;
  knowledgeExtraction?:
    | { status: "completed"; items: { id: number }[] }
    | { status: "failed"; error: string };
};

function describeExtraction(response: IngestResponse): IngestMessage {
  const { extraction, knowledgeExtraction } = response;

  if (extraction?.status === "skipped") {
    return { tone: "warning", text: "Already saved. Extraction was skipped to avoid duplicates." };
  }
  if (extraction?.status === "failed") {
    return { tone: "warning", text: `Saved, but extraction failed: ${extraction.error}` };
  }
  if (extraction?.status === "completed") {
    const knowledgeCount =
      knowledgeExtraction?.status === "completed" ? knowledgeExtraction.items.length : 0;
    if (extraction.tasks === 0 && knowledgeCount === 0) {
      return {
        tone: "warning",
        text: "Saved, but nothing grounded was found — no tasks or knowledge items extracted.",
      };
    }
    const projectMatch =
      response.projectMatch?.status === "matched" &&
      response.projectMatch.projectName &&
      response.projectMatch.matchedSignals.length > 0
        ? ` Matched to ${response.projectMatch.projectName} via ${response.projectMatch.matchedSignals.join(", ")}.`
        : "";
    const knowledgeWarning =
      knowledgeExtraction?.status === "failed"
        ? ` Knowledge extraction failed: ${knowledgeExtraction.error}`
        : "";
    return {
      tone: "success",
      text: `Found ${extraction.tasks} task${extraction.tasks === 1 ? "" : "s"} and ${knowledgeCount} knowledge item${knowledgeCount === 1 ? "" : "s"} — added to Today and Knowledge.${projectMatch}${knowledgeWarning}`,
    };
  }
  return { tone: "success", text: response.deduped ? "Already saved." : "Saved and extracted." };
}

export function IngestForm() {
  const router = useRouter();
  const [message, setMessage] = useState<IngestMessage | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", content: "" },
  });

  async function onSubmit(values: FormValues) {
    setMessage(null);
    try {
      const res = await fetch("/api/source-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: values.title, body: values.content }),
      });
      const data = (await res.json()) as IngestResponse | { error?: string };
      if (!res.ok) {
        throw new Error("error" in data && data.error ? data.error : "Failed to save");
      }
      reset();
      const msg = describeExtraction(data as IngestResponse);
      setMessage(msg);
      if (msg.tone === "success") Toast.toast.success("Transcript ingested.");
      else if (msg.tone === "warning") Toast.toast.warning("Saved with warnings.");
      router.refresh();
    } catch (err) {
      const text = err instanceof Error ? err.message : "Something went wrong. Try again.";
      setMessage({ tone: "error", text });
      Toast.toast.danger(text);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="app-card p-6 sm:p-7">
      <p className="eyebrow">Paste a transcript</p>
      <Input
        {...register("title")}
        type="text"
        placeholder="Title (optional)"
        aria-label="Transcript title"
        fullWidth
        className="h-11 border border-border bg-background/70 text-sm shadow-none mt-3"
      />
      <TextArea
        {...register("content")}
        placeholder="Paste meeting notes, a transcript, or any raw text…"
        rows={5}
        aria-label="Transcript text"
        aria-invalid={!!errors.content}
        fullWidth
        className="min-h-16 border border-border bg-background/70 text-sm shadow-none mt-2"
      />
      {errors.content && (
        <p className="mt-1 text-xs text-danger">{errors.content.message}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" isDisabled={isSubmitting}>
          {isSubmitting ? "Saving and extracting…" : "Save and extract"}
        </Button>
        <p className="text-xs leading-relaxed text-muted">
          Stored locally and analyzed for grounded tasks — results go straight into Today.
        </p>
      </div>
      {message ? (
        <p
          role="status"
          className={
            message.tone === "error"
              ? "mt-3 text-xs leading-relaxed text-danger"
              : message.tone === "warning"
                ? "mt-3 text-xs leading-relaxed text-warm"
                : "mt-3 text-xs leading-relaxed text-muted"
          }
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
