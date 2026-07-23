"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

interface DismissibleDayChangeProps {
  text: string;
}

export function DismissibleDayChange({ text }: DismissibleDayChangeProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <section className="brief-change-alert">
      <div className="brief-change-mark" aria-hidden>
        !
      </div>
      <div className="brief-change-content">
        <p className="brief-kicker">What changed</p>
        <p>{text}</p>
      </div>
      <button
        className="brief-change-dismiss"
        type="button"
        aria-label="Dismiss what changed"
        title="Dismiss"
        onClick={() => setDismissed(true)}
      >
        <XIcon aria-hidden />
      </button>
    </section>
  );
}
