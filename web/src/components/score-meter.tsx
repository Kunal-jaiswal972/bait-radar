// Chunky brutalist progress meter for a 0..100 clickbait score.
export function ScoreMeter({ value, label }: { value: number; label?: string }) {
  const color =
    value >= 70 ? "var(--color-bait-red)" : value >= 40 ? "var(--color-bait-orange)" : "var(--color-bait-green)"
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex justify-between text-xs font-heading uppercase tracking-wide">
          <span>{label}</span>
          <span>{value}%</span>
        </div>
      )}
      <div className="h-5 w-full overflow-hidden rounded-base border-2 border-border bg-secondary-background">
        <div className="h-full" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}
