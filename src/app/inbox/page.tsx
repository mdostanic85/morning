import { getSourceItems } from "@/services/sourceItems";
import { SourceBadge } from "@/components/SourceBadge";
import { EmptyState } from "@/components/EmptyState";
import { IngestForm } from "@/components/IngestForm";

export const dynamic = "force-dynamic";

function preview(text: string, max = 220): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export default async function InboxPage() {
  const sourceItems = await getSourceItems();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-[13px] text-muted mt-1">
          Raw signals — transcripts and notes — before they become tasks.
        </p>
      </div>

      <IngestForm />

      <div className="space-y-3">
        {sourceItems.length === 0 ? (
          <EmptyState
            title="Nothing in the inbox yet."
            description="Paste a transcript above to get started."
          />
        ) : (
          sourceItems.map((source) => (
            <article key={source.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[15px] font-medium">{source.title}</h3>
                <SourceBadge sourceType={source.sourceType} />
              </div>
              <p className="mt-2 text-[13px] text-muted">{preview(source.body)}</p>
              <p className="mt-2 text-[11px] text-muted">
                {new Date(source.sourceDate).toLocaleString()}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
