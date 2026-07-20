import { splitJiraMetadataFromText } from "@/lib/connectors/jiraText";
import { JiraMetadataBadges } from "./JiraMetadataBadges";
import { LinkifiedText, type LinkifyOptions } from "./LinkifiedText";
import { cn } from "@/lib/utils";

export function ReasonText({
  text,
  className,
  ...options
}: LinkifyOptions & { text: string; className?: string }) {
  const { prose, metadata } = splitJiraMetadataFromText(text);
  const displayText = prose || text;
  const hasMetadata = Object.values(metadata).some(Boolean);

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
