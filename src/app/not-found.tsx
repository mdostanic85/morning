import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">This page isn&apos;t available</h1>
      <p className="text-sm leading-relaxed text-muted">
        It may have been removed or the link may be out of date.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="link-btn-primary motion-btn">
          Back to Today
        </Link>
        <Link href="/settings" className="link-btn-outline motion-btn">
          Open Settings
        </Link>
      </div>
    </div>
  );
}
