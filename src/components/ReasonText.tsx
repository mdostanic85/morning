import { splitJiraMetadataFromText } from "@/lib/connectors/jiraText";
import { JiraMetadataBadges } from "./JiraMetadataBadges";
import { LinkifiedText, type LinkifyOptions } from "./LinkifiedText";
import { cn } from "@/lib/utils";

export function ReasonText({
  text,
  className,
  sentencePerLine = false,
  ...options
}: LinkifyOptions & {
  text: string;
  className?: string;
  sentencePerLine?: boolean;
}) {
  const { prose, metadata } = splitJiraMetadataFromText(text);
  const displayText = prose || text;
  const hasMetadata = Object.values(metadata).some(Boolean);

  if (sentencePerLine) {
    const sentences =
      displayText
        .match(/[\s\S]*?(?:[.!?]+["'”’]?(?=\s+[A-Z0-9“"'(@])|$)/g)
        ?.map((sentence) => sentence.trim())
        .filter(Boolean) ?? [displayText];

    return (
      <div className={cn("space-y-1.5", className)}>
        {sentences.map((sentence, index) => (
          <p key={`${index}-${sentence.slice(0, 24)}`}>
            <LinkifiedText text={sentence} {...options} />
          </p>
        ))}
        {hasMetadata ? <JiraMetadataBadges metadata={metadata} /> : null}
      </div>
    );
  }

  if (!hasMetadata) {
    return <LinkifiedText text={displayText} className={className} {...options} />;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {prose ? <LinkifiedText text={prose} {...options} /> : null}
      <JiraMetadataBadges metadata={metadata} />
    </div>
  );
}
