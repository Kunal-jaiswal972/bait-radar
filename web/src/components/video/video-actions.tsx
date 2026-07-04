import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useRefreshVideo } from "@/lib/queries"
import type { TranscriptStatus } from "@/data/types"

// Phase 6 write-back action on the video detail page: re-run the analysis on
// demand (re-fetch stats/comments/transcript, recompute every pillar, append a
// fresh timeline point) for any video, regardless of age.

const STATUS_LABEL: Record<TranscriptStatus, string> = {
  success: "Transcript: scraped",
  failed_retryable: "Transcript: unavailable",
}

export function VideoActions({
  videoId,
  transcriptStatus,
}: {
  videoId: string
  transcriptStatus: TranscriptStatus
}) {
  const refresh = useRefreshVideo(videoId)

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-heading text-xl">
            <RefreshCw className="size-5" /> Actions
          </h2>
          <Badge variant="neutral" className="font-base uppercase tracking-wide">
            {STATUS_LABEL[transcriptStatus]}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="font-heading uppercase"
          >
            <RefreshCw className={cn("size-4", refresh.isPending && "animate-spin")} />
            {refresh.isPending ? "Queuing…" : "Re-run analysis"}
          </Button>
          {refresh.isSuccess && (
            <span className="text-sm font-heading text-foreground/70">
              Queued — reload in a minute to see the refreshed scores.
            </span>
          )}
          {refresh.isError && (
            <span className="text-sm font-heading text-red-600">{refresh.error.message}</span>
          )}
        </div>
        <p className="text-xs text-foreground/55">
          Re-fetches stats, comments and transcript, recomputes every pillar, and appends
          a fresh timeline point — for any video, regardless of age.
        </p>
      </CardContent>
    </Card>
  )
}
