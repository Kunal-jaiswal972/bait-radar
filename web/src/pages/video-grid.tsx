import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Play, ThumbsUp } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { MetaBadge } from "@/components/meta-badges"
import { BaitDial } from "@/components/bait-dial"
import { FilterPills } from "@/components/shared/filter-pills"
import { ChannelFilter } from "@/components/video/channel-filter"
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/query-state"
import {
  BAIT_BUCKET,
  BAIT_FILTER_OPTIONS,
  SENTIMENT_FILTER_OPTIONS,
  VIDEOS_QUERY_LIMIT,
  VIDEO_SORT_OPTIONS,
  type BaitFilter,
  type SentimentFilter,
  type VideoSortKey,
} from "@/constants/filters"
import { useChannels, useVideos } from "@/lib/queries"
import { formatCompact, formatDate, formatDuration } from "@/lib/format"
import type { VideoCard } from "@/data/types"

export function VideoGrid() {
  const [params, setParams] = useSearchParams()
  // Multi-select: ?channel= can appear multiple times; a single ?channel= from
  // clicking a channel card pre-selects that one channel.
  const selectedChannels = params.getAll("channel")

  // Fetch the recent set + tracked channels once; all filtering is client-side.
  const videosQuery = useVideos({ limit: VIDEOS_QUERY_LIMIT })
  const channelsQuery = useChannels()
  const videos = useMemo(() => videosQuery.data ?? [], [videosQuery.data])
  const channels = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data])

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<VideoSortKey>("newest")
  const [bait, setBait] = useState<BaitFilter>("all")
  const [sentiment, setSentiment] = useState<SentimentFilter>("all")

  function selectChannels(next: string[]): void {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      p.delete("channel")
      next.forEach((id) => p.append("channel", id))
      return p
    })
  }

  const headerSubtitle = (() => {
    if (selectedChannels.length === 1) {
      const title =
        channels.find((c) => c.channelId === selectedChannels[0])?.title ??
        videos.find((v) => v.channelId === selectedChannels[0])?.channelTitle ??
        selectedChannels[0]
      return `Showing uploads from ${title}.`
    }
    if (selectedChannels.length > 1) return `Showing uploads from ${selectedChannels.length} channels.`
    return "Latest uploads across your tracked channels, scored for bait."
  })()

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = videos.filter((v) => {
      if (selectedChannels.length > 0 && !selectedChannels.includes(v.channelId)) return false
      if (bait !== "all" && BAIT_BUCKET[v.likelihood] !== bait) return false
      if (sentiment !== "all" && v.comment_sentiment !== sentiment) return false
      if (q && !v.title.toLowerCase().includes(q)) return false
      return true
    })
    return matches.sort((a, b) => {
      switch (sort) {
        case "views":
          return b.views - a.views
        case "bait":
          return b.clickbait_percentage - a.clickbait_percentage
        case "title":
          return a.title.localeCompare(b.title)
        case "oldest":
          return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
        default:
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      }
    })
  }, [videos, selectedChannels, query, sort, bait, sentiment])

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-4xl">Analyzed Videos</h1>
        <p className="mt-1 text-foreground/70">{headerSubtitle}</p>
      </header>

      {videosQuery.isLoading ? (
        <LoadingState label="Loading videos…" />
      ) : videosQuery.isError ? (
        <ErrorState message={videosQuery.error.message} />
      ) : videos?.length === 0 ? (
        <EmptyState message="No analyzed videos yet — track a channel and wait for its next upload (or run the backfill)." />
      ) : (
        <>
          <div className="space-y-3 rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search video titles…"
              className="bg-background"
            />
            <ChannelFilter channels={channels} value={selectedChannels} onChange={selectChannels} />
            <FilterPills label="Sort" options={VIDEO_SORT_OPTIONS} value={sort} onChange={setSort} />
            <FilterPills label="Bait" options={BAIT_FILTER_OPTIONS} value={bait} onChange={setBait} />
            <FilterPills
              label="Mood"
              hint="Filter by the overall sentiment of a video's comments — positive, negative, neutral or mixed."
              options={SENTIMENT_FILTER_OPTIONS}
              value={sentiment}
              onChange={setSentiment}
            />
          </div>

          <p className="text-xs font-heading uppercase tracking-wide text-foreground/55">
            {visible?.length} of {videos?.length} videos
          </p>

          {visible?.length === 0 ? (
            <EmptyState
              message={
                selectedChannels.length > 0
                  ? "No analyzed videos for the selected channels yet."
                  : "No videos match these filters."
              }
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visible?.map((v) => (
                <VideoGridCard key={v.videoId} video={v} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function VideoGridCard({ video }: { video: VideoCard }) {
  const [thumbBroken, setThumbBroken] = useState(false)

  const meta = [
    video.channelTitle || video.channelId,
    `${formatCompact(video.views)} views`,
    formatDate(video.publishedAt),
  ]
    .filter(Boolean)
    .join(" · ")

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
            <Play className="size-10 opacity-30" />
          )}
          {video.likes > 0 && (
            <Badge className="absolute bottom-2 left-2 bg-foreground font-heading text-background">
              <ThumbsUp className="size-3" /> {formatCompact(video.likes)}
            </Badge>
          )}
          {formatDuration(video.duration) && (
            <Badge className="absolute bottom-2 right-2 bg-foreground font-heading text-background">
              {formatDuration(video.duration)}
            </Badge>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <h3 className="line-clamp-2 font-heading text-base leading-snug">{video.title}</h3>
          <p className="text-xs font-heading uppercase tracking-wide text-foreground/55">{meta}</p>
          <div className="mt-auto flex items-center gap-3">
            <BaitDial value={video.clickbait_percentage} size={48} />
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5">
                <span className="text-[0.6rem] font-heading uppercase tracking-widest text-foreground/50">
                  Clickbait
                </span>
                <MetaBadge kind="likelihood" value={video.likelihood} />
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[0.6rem] font-heading uppercase tracking-widest text-foreground/50">
                  Comment mood
                </span>
                <MetaBadge kind="sentiment" value={video.comment_sentiment} />
              </span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
