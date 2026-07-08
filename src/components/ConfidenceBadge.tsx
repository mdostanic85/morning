function bucket(value: number): { label: string; style: string } {
  if (value >= 0.7) return { label: "High confidence", style: "text-[#3f6b1f] bg-[#eef4e6]" };
  if (value >= 0.4) return { label: "Medium confidence", style: "text-[#8a6d00] bg-[#f7f0dd]" };
  return { label: "Low confidence", style: "text-[#9c2b2b] bg-[#f6e7e7]" };
}

/** `level` is a 0..1 confidence score, as produced by extraction/classification jobs. */
export function ConfidenceBadge({ level }: { level: number }) {
  const { label, style } = bucket(level);
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${style}`}>
      {label} ({Math.round(level * 100)}%)
    </span>
  );
}
