import { getKnowledgeItemsWithContext } from "@/services/knowledgeItems";
import { getSourceItems } from "@/services/sourceItems";
import { getUserProfile } from "@/services/userProfile";
import { EmptyState } from "@/components/EmptyState";
import { KnowledgeHashScroll } from "@/components/KnowledgeHashScroll";
import { KnowledgeFilteredView } from "@/components/KnowledgeFilteredView";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { Heading } from "@/components/Heading";
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
        <Heading level={1} visualLevel={2} className="mt-2">Knowledge</Heading>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Recent learnings relevant to you, each linked to its evidence.
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Heading level={2} visualLevel={6} className="eyebrow text-foreground/70">
            Your learnings
          </Heading>
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
