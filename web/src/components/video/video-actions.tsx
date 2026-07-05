import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useRefreshVideo } from "@/lib/queries"
import type { TranscriptStatus } from "@/data/types"

// Write-back action on the video detail page: re-run the comment stage on demand
// — refetch the top-100 comments, recompute sentiment + betrayal + the merged
// score + channel rollup, and append a fresh stats point — for any video,
// regardless of age. Packaging/mismatch are left as-is (no Gemini/Vision re-run).

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
            {refresh.isPending ? "Queuing…" : "Refresh comments"}
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
          Refetches the top-100 comments and recomputes sentiment, betrayal, the bait
          score and the channel rollup, plus a fresh stats point — for any video,
          regardless of age.
        </p>
      </CardContent>
    </Card>
  )
}
