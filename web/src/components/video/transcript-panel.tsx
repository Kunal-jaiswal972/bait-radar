import { useState } from "react"
import { ChevronDown, ScrollText } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { MetaBadge } from "@/components/meta-badges"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Sentiment, TranscriptLine } from "@/data/types"

// Transcript shown in a collapsible (built on the registry Collapsible primitive).
// Timestamped lines in a scrollable box; collapsed by default since it's bulky.
// The header carries the overall transcript sentiment so it reads at a glance.
export function TranscriptPanel({
  lines,
  sentiment,
}: {
  lines: TranscriptLine[]
  sentiment?: Sentiment
}) {
  const [open, setOpen] = useState(false)
  const items = lines ?? []

  if (items.length === 0) return null

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-base border-2 border-border bg-secondary-background shadow-shadow"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex flex-wrap items-center gap-2 font-heading text-xl">
          <ScrollText className="size-5" /> Transcript
          {sentiment && <MetaBadge kind="sentiment" value={sentiment} />}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs font-heading uppercase tracking-wide text-foreground/55">
            {items.length} lines
          </span>
          <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-96 space-y-1.5 overflow-y-auto border-t-2 border-border p-4 text-sm">
          {items.map((line, i) => (
            <p key={i} className="flex gap-3">
              <span className="shrink-0 font-heading tabular-nums text-foreground/45">
                {formatTimestamp(line.start)}
              </span>
              <span className="text-foreground/80">{line.text}</span>
            </p>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
