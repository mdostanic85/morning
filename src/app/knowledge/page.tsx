import { getKnowledgeItemsWithContext } from "@/services/knowledgeItems";
import { getSourceItems } from "@/services/sourceItems";
import { getUserProfile } from "@/services/userProfile";
import { EmptyState } from "@/components/EmptyState";
import { KnowledgeHashScroll } from "@/components/KnowledgeHashScroll";
import { KnowledgeFilteredView } from "@/components/KnowledgeFilteredView";
import { filterKnowledgeForMe } from "@/lib/filters/knowledgeFilter";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const [allKnowledgeItems, sourceItems, profile] = await Promise.all([
    getKnowledgeItemsWithContext(),
    getSourceItems(),
    getUserProfile(),
  ]);

  const myName = profile?.name?.trim() ?? null;
  const myEmail = profile?.email ?? null;
  const sourceBodyByItemId = new Map(
    sourceItems.map((source) => [source.id, source.body] as const)
  );

  const knowledgeItems = filterKnowledgeForMe(allKnowledgeItems, {
    myName,
    myEmail,
    sourceBodyByItemId,
  });

  return (
    <div className="space-y-8">
      <KnowledgeHashScroll />
      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Knowledge</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Recent learnings relevant to you — each with its evidence.
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow text-foreground/70">Your learnings</h2>
        </div>

        <div className="mt-3">
          {allKnowledgeItems.length === 0 ? (
            <EmptyState
              title="No knowledge items yet."
              description="Learnings are extracted after you sync connected sources or paste a transcript in Settings."
            />
          ) : !myName ? (
            <EmptyState
              title="Your name is not set."
              description="Add your name in Settings so Morning can show only learnings relevant to you."
            />
          ) : (
            <KnowledgeFilteredView items={knowledgeItems} myName={myName} />
          )}
        </div>
      </section>
    </div>
  );
}
