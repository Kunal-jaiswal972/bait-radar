import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { TimelinePoint } from "@/data/types"

const config = {
  views: { label: "Views", color: "var(--color-bait-blue)" },
  likes: { label: "Likes", color: "var(--color-bait-pink)" },
} satisfies ChartConfig

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return `${n}`
}

// Engagement velocity — views & likes accumulating since publish.
export function EngagementChart({ data }: { data: TimelinePoint[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.15} />
        <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={36} tickFormatter={compact} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Area
          dataKey="views"
          type="monotone"
          fill="var(--color-views)"
          fillOpacity={0.5}
          stroke="var(--color-border)"
        />
        <Area
          dataKey="likes"
          type="monotone"
          fill="var(--color-likes)"
          fillOpacity={0.7}
          stroke="var(--color-border)"
        />
      </AreaChart>
    </ChartContainer>
  )
}
