import Link from "next/link";

const HUB_LINKS = [
  {
    href: "/schedule",
    label: "Automation",
    description: "Choose when weekday reports run and where they are delivered.",
  },
  {
    href: "/reports",
    label: "Report history",
    description: "Review past reports, source coverage, and outcomes.",
  },
  {
    href: "/sources",
    label: "Source health",
    description: "Check connection state, recent syncs, and report coverage.",
  },
  {
    href: "/audit",
    label: "Trust trail",
    description: "Config changes, manual runs, and delivery metadata.",
  },
  {
    href: "/knowledge",
    label: "Knowledge",
    description: "Browse recent evidence-backed learnings outside today's focus.",
  },
  {
    href: "/projects",
    label: "Work contexts",
    description: "Manage the projects and Jira boards used during sync.",
  },
] as const;

export function SettingsHubLinks() {
  return (
    <nav aria-label="Setup and reference" className="border-t border-border pt-6">
      <p className="eyebrow text-foreground/70">Setup and reference</p>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {HUB_LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex min-h-14 flex-col justify-center gap-0.5 px-2 py-3.5 transition-colors hover:bg-surface/60 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
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
