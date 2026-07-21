"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">This page couldn&apos;t load</h1>
      <p className="text-sm leading-relaxed text-muted">
        Your local data is unchanged. Try again, or return to Today.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="link-btn-primary motion-btn">
          Try again
        </button>
        <Link href="/" className="link-btn-outline motion-btn">
          Back to Today
        </Link>
      </div>
    </div>
  );
}
