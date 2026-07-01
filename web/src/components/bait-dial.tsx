import { baitScoreColor } from "@/lib/colors"

// Circular clickbait-score gauge: a themed ring filled to the score, with the
// percentage in the middle. The registry has no radial-progress primitive (only
// a linear one), so this is a minimal SVG — same spirit as the linear ScoreMeter.
export function BaitDial({ value, size = 132 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const stroke = Math.max(5, Math.round(size * 0.11))
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeOpacity={0.12}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={baitScoreColor(pct)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <span
        className="absolute font-heading leading-none tabular-nums"
        style={{ fontSize: Math.round(size / 3.4) }}
      >
        {pct}%
      </span>
    </div>
  )
}
