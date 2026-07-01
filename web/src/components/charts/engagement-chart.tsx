import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCompact, formatShortDateTime } from "@/lib/format"
import type { TimelinePoint } from "@/data/types"

// Views on the left axis (they dwarf the rest); likes + comments share the right
// axis so all three stay legible on one chart.
const config = {
  views: { label: "Views", color: "var(--color-bait-blue)" },
  likes: { label: "Likes", color: "var(--color-bait-pink)" },
  comments: { label: "Comments", color: "var(--color-bait-green)" },
} satisfies ChartConfig

export function EngagementChart({ data }: { data: TimelinePoint[] }) {
  const points = data ?? []

  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm font-heading uppercase tracking-wide text-foreground/50">
        No engagement snapshots yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <LineChart data={points} margin={{ left: 4, right: 4, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.15} />
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={formatShortDateTime}
          />
          <YAxis yAxisId="views" tickLine={false} axisLine={false} width={40} tickFormatter={formatCompact} />
          <YAxis
            yAxisId="engagement"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={formatCompact}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent indicator="line" labelFormatter={(value) => formatShortDateTime(String(value))} />
            }
          />
          <Line yAxisId="views" dataKey="views" type="monotone" stroke="var(--color-views)" strokeWidth={2} dot={{ r: 2 }} />
          <Line yAxisId="engagement" dataKey="likes" type="monotone" stroke="var(--color-likes)" strokeWidth={2} dot={{ r: 2 }} />
          <Line
            yAxisId="engagement"
            dataKey="comments"
            type="monotone"
            stroke="var(--color-comments)"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        </LineChart>
      </ChartContainer>

      <div className="flex flex-wrap gap-4 text-xs font-heading uppercase tracking-wide">
        {Object.entries(config).map(([key, c]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-full border-2 border-border"
              style={{ backgroundColor: c.color }}
            />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}
