"use client";

import { useState } from "react";
import type { LlmProvider, ProviderKeyStatus } from "@/services/settings";

const PROVIDER_LABEL: Record<LlmProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

export function ApiKeyForm({ initialStatus }: { initialStatus: ProviderKeyStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: status.provider, key }),
    });
    if (res.ok) {
      const data = await res.json();
      const updated = data.statuses.find(
        (s: ProviderKeyStatus) => s.provider === status.provider
      );
      if (updated) setStatus(updated);
      setKey("");
    }
    setSaving(false);
  }

  async function handleClear() {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: status.provider }),
    });
    if (res.ok) {
      const data = await res.json();
      const updated = data.statuses.find(
        (s: ProviderKeyStatus) => s.provider === status.provider
      );
      if (updated) setStatus(updated);
    }
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-medium">{PROVIDER_LABEL[status.provider]}</h3>
        <span className="text-[12px] text-muted">
          {status.configured
            ? `${status.source === "env" ? "From environment" : "Saved"} · ${status.maskedKey}`
            : "Not configured"}
        </span>
      </div>
      <form onSubmit={handleSave} className="mt-3 flex items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={status.configured ? "Enter a new key to replace it" : "Paste API key"}
          className="flex-1 rounded border border-border bg-background px-2.5 py-1.5 text-[14px] outline-none focus:border-foreground/40"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={saving || !key.trim()}
          className="rounded bg-foreground px-3 py-1.5 text-[13px] font-medium text-background disabled:opacity-40"
        >
          Save
        </button>
        {status.source === "settings" ? (
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="rounded border border-border px-3 py-1.5 text-[13px] text-muted hover:text-foreground"
          >
            Remove
          </button>
        ) : null}
      </form>
      {status.source === "env" ? (
        <p className="mt-2 text-[12px] text-muted">
          Set via environment variable — saving a key here will only take effect if the
          environment variable is unset.
        </p>
      ) : null}
    </div>
  );
}
