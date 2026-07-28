import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./Heading.module.css";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingProps
  extends Omit<HTMLAttributes<HTMLHeadingElement>, "children"> {
  /**
   * The heading's position in the document outline. Choose this from the
   * surrounding content structure, never from the desired text size.
   */
  level: HeadingLevel;
  /**
   * The visual tier from the shared heading scale. Defaults to `level`, but
   * can differ when a component needs a quieter or stronger presentation.
   */
  visualLevel?: HeadingLevel;
  children: ReactNode;
}

const HEADING_TAGS = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
  5: "h5",
  6: "h6",
} as const;

/**
 * Keeps semantic hierarchy independent from visual hierarchy.
 *
 * @example
 * <Heading level={2} visualLevel={4}>Panel title</Heading>
 */
export function Heading({
  level,
  visualLevel = level,
  className,
  children,
  ...props
}: HeadingProps) {
  const Tag = HEADING_TAGS[level];

  return (
    <Tag
      className={cn(
        styles["type-heading"],
        styles[`type-heading-${visualLevel}`],
        className
      )}
      data-heading-level={level}
      data-heading-visual={visualLevel}
      {...props}
    >
      {children}
    </Tag>
  );
}
