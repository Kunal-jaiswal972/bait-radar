import { useState } from "react"
import { Link } from "react-router-dom"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LikelihoodBadge, SentimentBadge } from "@/components/meta-badges"
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/query-state"
import { useVideos } from "@/lib/queries"
import { formatCompact } from "@/lib/format"
import type { VideoCard } from "@/data/types"

export function VideoGrid() {
  const videosQuery = useVideos()
  const videos = videosQuery.data ?? []

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-4xl">Analyzed Videos</h1>
        <p className="mt-1 text-foreground/70">Latest uploads across your tracked channels, scored for bait.</p>
      </header>

      {videosQuery.isLoading ? (
        <LoadingState label="Loading videos…" />
      ) : videosQuery.isError ? (
        <ErrorState message={videosQuery.error.message} />
      ) : videos.length === 0 ? (
        <EmptyState message="No analyzed videos yet — track a channel and wait for its next upload (or run the backfill)." />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <VideoGridCard key={v.videoId} video={v} />
          ))}
        </div>
      )}
    </div>
  )
}

function VideoGridCard({ video }: { video: VideoCard }) {
  const [thumbBroken, setThumbBroken] = useState(false)

  return (
    <Link
      to={`/videos/${video.videoId}`}
      className="transition-all hover:-translate-x-boxShadowX hover:-translate-y-boxShadowY hover:[&>*]:shadow-none"
    >
      <Card className="h-full gap-0 overflow-hidden py-0">
        <div className="relative flex h-40 items-center justify-center border-b-2 border-border bg-secondary-background">
          {video.thumbnailUrl && !thumbBroken ? (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              loading="lazy"
              onError={() => setThumbBroken(true)}
              className="size-full object-cover"
            />
          ) : (
            <span className="font-heading text-5xl opacity-30">▶</span>
          )}
          <Badge className="absolute right-2 top-2 bg-foreground font-heading text-background">
            {video.clickbait_percentage}%
          </Badge>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <h3 className="line-clamp-2 font-heading text-base leading-snug">{video.title}</h3>
          <p className="text-xs font-heading uppercase tracking-wide text-foreground/55">
            {video.channelTitle || video.channelId} · {formatCompact(video.views)} views
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            <LikelihoodBadge value={video.likelihood} />
            <SentimentBadge value={video.comment_sentiment} />
          </div>
        </div>
      </Card>
    </Link>
  )
}
