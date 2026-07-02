import { type ReactNode, useState } from "react"
import { ChevronDown, Gauge } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { VideoDetail } from "@/data/types"

// Transparency panel: the raw datapoints + sub-scores behind the bait score —
// packaging (heuristic vs AI), mismatch source, betrayal rate, transcript tone,
// and the thumbnail signals from vision. Built on the registry Collapsible.

const toPct = (v: number | undefined): number => Math.round((v ?? 0) * 100)

export function ScoreBreakdown({ video }: { video: VideoDetail }) {
  const [open, setOpen] = useState(false)

  const insights = video.insights
  const pillars = insights?.pillars
  const mismatch = pillars?.mismatch
  const betrayal = insights?.betrayal
  const ocr = insights?.thumbnail?.ocr_text ?? []
  const tags = insights?.thumbnail?.tags ?? []
  const objects = insights?.thumbnail?.objects ?? []

  const hasTranscript = (video.transcript?.length ?? 0) > 0
  const hasComments = (betrayal?.total_comments ?? 0) > 0

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-base border-2 border-border bg-secondary-background shadow-shadow"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2 font-heading text-xl">
          <Gauge className="size-5" /> Score breakdown
        </span>
        <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 border-t-2 border-border p-4 text-sm">
          <Row label="Packaging" value={`${toPct(pillars?.packaging)}%`} strong />
          <Divider />
          <Row
            label="Promise–payoff mismatch"
            value={mismatch?.available ? `${toPct(mismatch.score)}%` : "unavailable"}
          />
          <Divider />
          <Row
            label="Audience betrayal"
            value={
              hasComments
                ? `${toPct(betrayal?.betrayal_rate)}% · ${betrayal?.flagged_count ?? 0}/${betrayal?.total_comments ?? 0} comments`
                : "unavailable"
            }
          />
          <Divider />
          <Row
            label="Transcript tone"
            value={hasTranscript ? (insights?.transcript?.sentiment ?? "unavailable") : "unavailable"}
          />
          <Divider />
          <Signals label="Thumbnail text (OCR)" items={ocr} className="bg-bait-yellow" />
          <Signals label="Vision tags" items={tags} className="bg-bait-blue" />
          <Signals label="Objects" items={objects} className="bg-bait-green" />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }): ReactNode {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-foreground/70">{label}</span>
      <span className={cn("font-heading tabular-nums", strong && "text-base")}>{value}</span>
    </div>
  )
}

function Divider(): ReactNode {
  return <div className="border-t-2 border-dashed border-border" />
}

function Signals({
  label,
  items,
  className,
}: {
  label: string
  items: string[]
  className: string
}): ReactNode {
  return (
    <div>
      <p className="mb-1.5 text-xs font-heading uppercase tracking-wide text-foreground/55">{label}</p>
      {items.length === 0 ? (
        <p className="text-xs text-foreground/40">— none detected</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <Badge key={it} className={cn("font-base", className)}>
              {it}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
