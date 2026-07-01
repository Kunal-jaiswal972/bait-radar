import { Cell, Label, Pie, PieChart } from "recharts"

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
  neutral: { label: "Neutral", color: "var(--color-bait-blue)" },
  mixed: { label: "Mixed", color: "var(--color-bait-purple)" },
} satisfies ChartConfig

// Comment sentiment as a brutalist donut. The center shows the dominant mood and
// a legend sits below, so it reads clearly without hovering.
export function SentimentDonut({ dist }: { dist?: Dist }) {
  const keys = Object.keys(config) as (keyof Dist)[]
  const data = keys.map((k) => ({ key: k, value: dist?.[k] ?? 0, fill: config[k].color }))
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const dominant = data.reduce((top, d) => (d.value > top.value ? d : top), data[0])
  const toPct = (v: number): number => (total > 0 ? Math.round((v / total) * 100) : 0)

  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm font-heading uppercase tracking-wide text-foreground/50">
        No comment sentiment yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <ChartContainer config={config} className="mx-auto aspect-square h-[200px]">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="key" innerRadius={58} strokeWidth={2}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.fill} stroke="var(--color-border)" />
            ))}
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan
                      x={viewBox.cx}
                      dy="-0.2em"
                      className="fill-foreground font-heading"
                      style={{ fontSize: "1.5rem" }}
                    >
                      {toPct(dominant.value)}%
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      dy="1.5em"
                      className="fill-foreground/60 font-heading"
                      style={{ fontSize: "0.65rem", textTransform: "uppercase" }}
                    >
                      {config[dominant.key].label}
                    </tspan>
                  </text>
                )
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-heading uppercase tracking-wide">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full border-2 border-border"
                style={{ backgroundColor: d.fill }}
              />
              {config[d.key].label}
            </span>
            <span className="text-foreground/60">{toPct(d.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
