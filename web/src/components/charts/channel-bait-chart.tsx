import type { ReactNode } from "react"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { Channel } from "@/data/types"

const config = {
  propensity: { label: "Clickbait %", color: "var(--color-main)" },
} satisfies ChartConfig

// Bar color scales with the score: green → orange → red.
function barColor(v: number): string {
  if (v >= 70) return "var(--color-bait-red)"
  if (v >= 40) return "var(--color-bait-orange)"
  return "var(--color-bait-green)"
}

// Compare clickbait propensity across all analyzed channels.
export function ChannelBaitChart({ channels }: { channels: Channel[] }) {
  const data = (channels ?? []).flatMap((c) =>
    c.clickbait
      ? [{ name: c.title, propensity: c.clickbait.propensity_percentage, fill: barColor(c.clickbait.propensity_percentage) }]
      : []
  )

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm font-heading uppercase tracking-wide text-foreground/50">
        No scored channels yet.
      </p>
    )
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} margin={{ top: 20, right: 8, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.15} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="propensity" radius={4} stroke="var(--color-border)" strokeWidth={2}>
          <LabelList dataKey="propensity" position="top" className="fill-foreground font-heading" formatter={(v: ReactNode) => `${v}%`} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
