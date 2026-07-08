import Link from "next/link";

interface ProjectCardProps {
  id: number;
  name: string;
  description: string | null;
  keywords: string[];
  openTaskCount: number;
}

export function ProjectCard({ id, name, description, keywords, openTaskCount }: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${id}`}
      className="block rounded-lg border border-border bg-surface p-4 hover:border-foreground/30 transition-colors"
    >
      <h3 className="text-[15px] font-medium">{name}</h3>
      {description ? (
        <p className="mt-1 text-[13px] text-muted">{description}</p>
      ) : null}
      {keywords.length > 0 ? (
        <p className="mt-2 text-[12px] text-muted">{keywords.join(" · ")}</p>
      ) : null}
      <p className="mt-3 text-[12px] text-muted">
        {openTaskCount} open task{openTaskCount === 1 ? "" : "s"}
      </p>
    </Link>
  );
}
