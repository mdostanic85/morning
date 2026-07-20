"use client";

import { useState } from "react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Switch } from "@heroui/react/switch";
import type { LlmProvider, ProviderKeyStatus } from "@/services/settings";

const PROVIDER_LABEL: Record<LlmProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
};

const PROVIDER_KEY_URL: Record<LlmProvider, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  groq: "https://console.groq.com/keys",
};

const PROVIDER_HINT: Partial<Record<LlmProvider, string>> = {
  groq: "Primary — all text jobs (70b, then 8b if rate-limited). Free tier.",
  openai: "Embeddings only (knowledge search). Optional text fallback.",
  anthropic: "Optional text fallback after Groq.",
};

export function ApiKeyForm({ initialStatus }: { initialStatus: ProviderKeyStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: status.provider, key }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not save the key.");
      }
      const updated = data.statuses.find(
        (s: ProviderKeyStatus) => s.provider === status.provider
      );
      if (updated) setStatus(updated);
      setKey("");
      setEditing(false);
      Toast.toast.success("Key saved.");
    } catch (err) {
      Toast.toast.danger(err instanceof Error ? err.message : "Could not save the key.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: status.provider, enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not update provider.");
      }
      const updated = data.statuses.find(
        (s: ProviderKeyStatus) => s.provider === status.provider
      );
      if (updated) setStatus(updated);
      Toast.toast.success(enabled ? "Provider enabled." : "Provider paused.");
    } catch (err) {
      Toast.toast.danger(err instanceof Error ? err.message : "Could not update provider.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: status.provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not remove the key.");
      }
      const updated = data.statuses.find(
        (s: ProviderKeyStatus) => s.provider === status.provider
      );
      if (updated) setStatus(updated);
      Toast.toast.success("Key removed.");
    } catch (err) {
      Toast.toast.danger(err instanceof Error ? err.message : "Could not remove the key.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-medium">{PROVIDER_LABEL[status.provider]}</h3>
            <a
              href={PROVIDER_KEY_URL[status.provider]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent underline-offset-2 hover:underline"
            >
              Get key
            </a>
            {PROVIDER_HINT[status.provider] ? (
              <span className="text-xs text-muted-soft">· {PROVIDER_HINT[status.provider]}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {status.configured
              ? `${status.source === "env" ? "From environment" : "Saved"} · ${status.maskedKey}${
                  status.enabled ? " · Active" : " · Paused"
                }`
              : "Not configured"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status.configured ? (
            <Switch
              size="sm"
              isSelected={status.enabled}
              onChange={handleToggle}
              isDisabled={saving}
              aria-label={`${PROVIDER_LABEL[status.provider]} ${status.enabled ? "enabled" : "paused"}`}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          ) : null}
          {status.source === "settings" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              isDisabled={saving}
            >
              Remove
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
          >
            {editing ? "Cancel" : status.configured ? "Replace" : "Add key"}
          </Button>
        </div>
      </div>
      {editing ? (
        <form onSubmit={handleSave} className="form-inline mt-3">
          <Input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste API key"
            aria-label={`${PROVIDER_LABEL[status.provider]} API key`}
            autoComplete="off"
            autoFocus
          />
          <Button type="submit" size="sm" isDisabled={saving || !key.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </form>
      ) : null}
      {status.source === "env" ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-soft">
          Set via environment variable — a saved key only takes effect once it&apos;s unset.
        </p>
      ) : null}
    </div>
  );
}
