import Link from "next/link";

const HUB_LINKS = [
  {
    href: "/sources",
    label: "Source health",
    description: "Last-run connection health — separate from connect/disconnect.",
  },
  {
    href: "/projects",
    label: "Work contexts",
    description: "Jira boards and project settings used when syncing.",
  },
  {
    href: "/schedule",
    label: "Automated briefs",
    description: "Weekday schedule, delivery, and manual brief runs.",
  },
  {
    href: "/reports",
    label: "Run history",
    description: "Past brief runs with evidence coverage and outcomes.",
  },
  {
    href: "/audit",
    label: "Activity log",
    description: "Settings changes, manual runs, and delivery metadata.",
  },
  {
    href: "/knowledge",
    label: "Recent learnings",
    description: "Recent learnings with evidence — not part of today’s focus.",
  },
] as const;

export function SettingsHubLinks() {
  return (
    <nav aria-label="Setup and reference" className="border-t border-border pt-6">
      <h2 className="text-sm font-semibold text-foreground">Setup and reference</h2>
      <p className="mt-1 text-sm text-muted">
        Source health, work contexts, automated briefs, run history, and recent learnings.
      </p>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {HUB_LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex flex-col gap-0.5 py-3.5 transition-colors hover:bg-surface/60 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            >
              <span className="font-medium text-foreground group-hover:text-accent">
                {item.label}
              </span>
              <span className="max-w-xl text-sm leading-relaxed text-muted sm:text-right">
                {item.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
