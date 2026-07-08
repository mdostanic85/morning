import { searchSourceItems } from "@/services/sourceItems";
import { SourceBadge } from "@/components/SourceBadge";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

function preview(text: string, max = 260): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const results = await searchSourceItems(q ?? "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Knowledge</h1>
        <p className="text-[13px] text-muted mt-1">
          Search everything that has been ingested so far.
        </p>
      </div>

      <form action="/knowledge" method="get">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search sources by keyword…"
          className="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-[14px] outline-none focus:border-foreground/40"
        />
      </form>

      {results.length === 0 ? (
        <EmptyState
          title={q ? `No results for "${q}".` : "Nothing ingested yet."}
          description={q ? undefined : "Sources appear here once you paste a transcript in Inbox."}
        />
      ) : (
        <div className="space-y-3">
          {results.map((source) => (
            <article key={source.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[15px] font-medium">{source.title}</h3>
                <SourceBadge sourceType={source.sourceType} />
              </div>
              <p className="mt-2 text-[13px] text-muted">{preview(source.body)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
