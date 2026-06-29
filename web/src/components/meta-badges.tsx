import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Likelihood, Sentiment, SubStatus, Trend } from "@/data/types"

// Brutalist colored badges built on the neobrutalism Badge primitive.
// We pass a bg color via className; the border + radius come from the base.

const likelihoodColor: Record<Likelihood, string> = {
  "Least Likely": "bg-bait-green",
  "Less Likely": "bg-bait-green",
  Normal: "bg-bait-yellow",
  "Highly Likely": "bg-bait-orange",
  "Most Likely": "bg-bait-red text-white",
}

export function LikelihoodBadge({ value }: { value: Likelihood }) {
  return <Badge className={cn("font-heading uppercase", likelihoodColor[value])}>{value}</Badge>
}

const sentimentColor: Record<Sentiment, string> = {
  Positive: "bg-bait-green",
  Negative: "bg-bait-red text-white",
  Neutral: "bg-secondary-background",
  Mixed: "bg-bait-purple",
}

export function SentimentBadge({ value }: { value: Sentiment }) {
  return <Badge className={cn("font-heading uppercase", sentimentColor[value])}>{value}</Badge>
}

const statusColor: Record<SubStatus, string> = {
  verified: "bg-bait-green",
  pending: "bg-bait-yellow",
  failed: "bg-bait-red text-white",
}

export function StatusBadge({ value }: { value: SubStatus }) {
  return <Badge className={cn("font-heading uppercase", statusColor[value])}>{value}</Badge>
}

const trendGlyph: Record<Trend, string> = { rising: "▲", falling: "▼", stable: "▬" }

export function TrendBadge({ value }: { value: Trend }) {
  const color =
    value === "rising" ? "bg-bait-red text-white" : value === "falling" ? "bg-bait-green" : "bg-secondary-background"
  return (
    <Badge className={cn("font-heading uppercase", color)}>
      {trendGlyph[value]} {value}
    </Badge>
  )
}
