import Link from "next/link";
import { getKnowledgeItemsWithContext } from "@/services/knowledgeItems";
import { getSourceItems } from "@/services/sourceItems";
import { getUserProfile } from "@/services/userProfile";
import { EmptyState } from "@/components/EmptyState";
import { KnowledgeHashScroll } from "@/components/KnowledgeHashScroll";
import { KnowledgeFilteredView } from "@/components/KnowledgeFilteredView";
import { SettingsBackLink } from "@/components/SettingsBackLink";
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
        <SettingsBackLink section="Knowledge" />
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Knowledge</h1>
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
              title="No learnings yet"
              description="Sync a source or paste notes to extract recent, evidence-backed learnings."
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <Link href="/" className="link-btn-primary motion-btn">
                    Sync my day
                  </Link>
                  <Link href="/settings" className="link-btn-outline motion-btn">
                    Paste notes
                  </Link>
                </div>
              }
            />
          ) : !myName ? (
            <EmptyState
              title="Your name is not set."
              description="Add your name in Settings so Worklight can show only learnings relevant to you."
            />
          ) : (
            <KnowledgeFilteredView items={knowledgeItems} myName={myName} />
          )}
        </div>
      </section>
    </div>
  );
}
