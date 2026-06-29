import { Cell, Pie, PieChart } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

type Dist = { positive: number; negative: number; neutral: number; mixed: number }

const config = {
  positive: { label: "Positive", color: "var(--color-bait-green)" },
  negative: { label: "Negative", color: "var(--color-bait-red)" },
  neutral: { label: "Neutral", color: "var(--color-secondary-background)" },
  mixed: { label: "Mixed", color: "var(--color-bait-purple)" },
} satisfies ChartConfig

// Comment sentiment split as a brutalist donut.
export function SentimentDonut({ dist }: { dist: Dist }) {
  const data = (Object.keys(config) as (keyof Dist)[]).map((k) => ({
    key: k,
    value: dist[k],
    fill: config[k].color,
  }))

  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-[220px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={55} strokeWidth={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} stroke="var(--color-border)" />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
