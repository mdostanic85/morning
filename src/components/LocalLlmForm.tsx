"use client";

import { useState } from "react";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Switch } from "@heroui/react/switch";
import { Toast } from "@heroui/react/toast";
import type { LocalLlmStatus } from "@/services/settings";
import { Heading } from "@/components/Heading";

export function LocalLlmForm({ initialStatus }: { initialStatus: LocalLlmStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [baseUrl, setBaseUrl] = useState(
    initialStatus.baseUrl || "http://127.0.0.1:8080/v1"
  );
  const [model, setModel] = useState(initialStatus.model);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function saveConfiguration(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/settings/local-llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          model,
          ...(apiKey.trim() ? { apiKey } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save Local LLM.");
      setStatus(data.status);
      setBaseUrl(data.status.baseUrl);
      setModel(data.status.model);
      setApiKey("");
      Toast.toast.success("Local LLM saved.");
    } catch (error) {
      Toast.toast.danger(
        error instanceof Error ? error.message : "Could not save Local LLM."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleProvider(enabled: boolean) {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/local-llm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update Local LLM.");
      setStatus(data.status);
      Toast.toast.success(enabled ? "Local LLM enabled." : "Local LLM paused.");
    } catch (error) {
      Toast.toast.danger(
        error instanceof Error ? error.message : "Could not update Local LLM."
      );
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const response = await fetch("/api/settings/local-llm/test", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Local LLM test failed.");
      Toast.toast.success(`Connected to ${data.model}.`);
    } catch (error) {
      Toast.toast.danger(
        error instanceof Error ? error.message : "Local LLM test failed."
      );
    } finally {
      setTesting(false);
    }
  }

  async function removeConfiguration() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/local-llm", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not remove Local LLM.");
      setStatus(data.status);
      setModel("");
      setApiKey("");
      Toast.toast.success("Local LLM removed.");
    } catch (error) {
      Toast.toast.danger(
        error instanceof Error ? error.message : "Could not remove Local LLM."
      );
    } finally {
      setSaving(false);
    }
  }

  const environmentManaged = status.source === "env";

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <Heading level={3} visualLevel={6}>Local LLM</Heading>
            <span className="text-metadata text-muted-soft">
              · Emergency fallback after cloud models
            </span>
          </div>
          <p className="mt-0.5 text-metadata text-muted">
            {status.configured
              ? `${status.model} · ${status.enabled ? "Active" : "Paused"}`
              : "Not configured"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status.configured ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={testConnection}
                isDisabled={testing || saving}
              >
                {testing ? "Testing…" : "Test"}
              </Button>
              <Switch
                size="sm"
                isSelected={status.enabled}
                onChange={toggleProvider}
                isDisabled={saving}
                aria-label={`Local LLM ${status.enabled ? "enabled" : "paused"}`}
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </>
          ) : null}
        </div>
      </div>

      <form onSubmit={saveConfiguration} className="mt-4 grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="text-metadata font-medium text-muted">Base URL</span>
            <Input
              className="mt-1.5"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="http://127.0.0.1:8080/v1"
              disabled={environmentManaged}
            />
            <span className="mt-1 block text-metadata text-muted-soft">
              OpenAI-compatible endpoint; /chat/completions is added automatically.
            </span>
          </label>
          <label>
            <span className="text-metadata font-medium text-muted">Model</span>
            <Input
              className="mt-1.5"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="mlx-community/Qwen3.6-35B-A3B-4bit"
              disabled={environmentManaged}
            />
            <span className="mt-1 block text-metadata text-muted-soft">
              Use the exact model id exposed by your local server.
            </span>
          </label>
        </div>
        <label>
          <span className="text-metadata font-medium text-muted">Access token (optional)</span>
          <Input
            className="mt-1.5"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              status.maskedKey ? "Leave blank to keep saved token" : "No token required"
            }
            autoComplete="off"
            disabled={environmentManaged}
          />
          <span className="mt-1 block text-metadata text-muted-soft">
            Most localhost MLX servers do not require a token.
          </span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-metadata leading-relaxed text-muted-soft">
            When active, the local model is used only if enabled cloud models fail.
            Embeddings still use OpenAI.
          </p>
          <div className="flex items-center gap-2">
            {status.source === "settings" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removeConfiguration}
                isDisabled={saving}
              >
                Remove
              </Button>
            ) : null}
            <Button
              type="submit"
              size="sm"
              isDisabled={
                saving ||
                environmentManaged ||
                !baseUrl.trim() ||
                !model.trim()
              }
            >
              {saving ? "Saving…" : status.configured ? "Save changes" : "Save"}
            </Button>
          </div>
        </div>
      </form>

      {environmentManaged ? (
        <p className="mt-3 text-metadata leading-relaxed text-muted-soft">
          Managed through LOCAL_LLM_BASE_URL and LOCAL_LLM_MODEL environment variables.
        </p>
      ) : null}
    </div>
  );
}
