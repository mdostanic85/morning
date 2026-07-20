import Link from "next/link";

export function SettingsBackLink({ section }: { section?: string }) {
  return (
    <p className="text-sm text-muted">
      <Link href="/settings" className="text-accent hover:underline">
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
