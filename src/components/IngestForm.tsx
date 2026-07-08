"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function IngestForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/source-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body: content }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setTitle("");
      setContent("");
      setStatus("idle");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted">Paste a transcript</p>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="mt-2 w-full rounded border border-border bg-background px-2.5 py-1.5 text-[14px] outline-none focus:border-foreground/40"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste meeting notes, a transcript, or any raw text…"
        rows={5}
        className="mt-2 w-full rounded border border-border bg-background px-2.5 py-1.5 text-[14px] outline-none focus:border-foreground/40"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving" || !content.trim()}
          className="rounded bg-foreground px-3 py-1.5 text-[13px] font-medium text-background disabled:opacity-40"
        >
          {status === "saving" ? "Saving…" : "Save to Inbox"}
        </button>
        <p className="text-[12px] text-muted">
          Stored as-is. Extraction into tasks isn&apos;t wired up yet.
        </p>
      </div>
      {status === "error" ? (
        <p className="mt-2 text-[12px] text-[#9c2b2b]">Something went wrong. Try again.</p>
      ) : null}
    </form>
  );
}
