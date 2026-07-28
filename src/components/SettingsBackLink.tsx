import Link from "next/link";

export function SettingsBackLink({ section }: { section?: string }) {
  return (
    <p className="flex min-h-11 items-center text-sm text-muted">
      <Link href="/settings" className="inline-flex min-h-11 items-center text-accent hover:underline">
        Settings
      </Link>
      {section ? (
        <>
          <span className="mx-1.5 text-muted-soft" aria-hidden>
            /
          </span>
          <span>{section}</span>
        </>
      ) : null}
    </p>
  );
}
