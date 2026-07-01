import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react"

import { badgeVariants } from "@/components/ui/badge"
import { HintTooltip } from "@/components/shared/hint-tooltip"
import { cn } from "@/lib/utils"
import { LIKELIHOOD_INFO, SENTIMENT_INFO, TREND_INFO } from "@/lib/labels"
import type { Likelihood, Sentiment, Trend } from "@/data/types"

// One self-explaining brutalist badge for every categorical metric. Each `kind`
// maps its value to a color, an optional icon, and a plain-language explanation
// shown on hover. Rendered as a <span> trigger (not a <button>) so it stays valid
// inside the card <Link>s. Relies on the app-root TooltipProvider (see main.tsx).

type MetaBadgeProps =
  | { kind: "likelihood"; value: Likelihood }
  | { kind: "sentiment"; value: Sentiment }
  | { kind: "trend"; value: Trend }

interface BadgeView {
  color: string
  title: string
  body: string
  icon?: LucideIcon
}

const likelihoodColor: Record<Likelihood, string> = {
  "Least Likely": "bg-bait-green",
  "Less Likely": "bg-bait-green",
  Normal: "bg-bait-yellow",
  "Highly Likely": "bg-bait-orange",
  "Most Likely": "bg-bait-red text-white",
}

const sentimentColor: Record<Sentiment, string> = {
  Positive: "bg-bait-green",
  Negative: "bg-bait-red text-white",
  Neutral: "bg-secondary-background",
  Mixed: "bg-bait-purple",
}

const trendColor: Record<Trend, string> = {
  rising: "bg-bait-red text-white",
  falling: "bg-bait-green",
  stable: "bg-secondary-background",
}

const trendIcon: Record<Trend, LucideIcon> = {
  rising: TrendingUp,
  falling: TrendingDown,
  stable: Minus,
}

function resolve(props: MetaBadgeProps): BadgeView {
  switch (props.kind) {
    case "likelihood": {
      const info = LIKELIHOOD_INFO[props.value]
      return { color: likelihoodColor[props.value], title: `${props.value} · ${info.range} bait`, body: info.blurb }
    }
    case "sentiment":
      return {
        color: sentimentColor[props.value],
        title: `${props.value} comments`,
        body: SENTIMENT_INFO[props.value],
      }
    case "trend":
      return {
        color: trendColor[props.value],
        title: `Trend: ${props.value}`,
        body: TREND_INFO[props.value],
        icon: trendIcon[props.value],
      }
  }
}

export function MetaBadge(props: MetaBadgeProps) {
  const { color, title, body, icon: Icon } = resolve(props)
  return (
    <HintTooltip
      content={
        <span className="block">
          <span className="block font-heading uppercase tracking-wide">{title}</span>
          <span className="mt-1 block">{body}</span>
        </span>
      }
    >
      <span className={cn(badgeVariants(), "cursor-help font-heading uppercase", color)}>
        {Icon && <Icon className="size-3" />}
        {props.value}
      </span>
    </HintTooltip>
  )
}
