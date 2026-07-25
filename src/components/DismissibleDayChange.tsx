"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { XIcon } from "lucide-react";

interface DismissibleDayChangeProps {
  text: string;
  title?: string;
  tone?: "accent" | "warning";
  icon?: ReactNode;
  dismissLabel?: string;
}

export function DismissibleDayChange({
  text,
  title = "What changed",
  tone = "accent",
  icon = "!",
  dismissLabel = "Dismiss what changed",
}: DismissibleDayChangeProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <section
      className={`brief-change-alert${tone === "warning" ? " brief-change-alert--warning" : ""}`}
      role="status"
    >
      <div className="brief-change-mark" aria-hidden>
        {icon}
      </div>
      <div className="brief-change-content">
        <p className="brief-kicker">{title}</p>
        <p>{text}</p>
      </div>
      <button
        className="brief-change-dismiss"
        type="button"
        aria-label={dismissLabel}
        title="Dismiss"
        onClick={() => setDismissed(true)}
      >
        <XIcon aria-hidden />
      </button>
    </section>
  );
}
