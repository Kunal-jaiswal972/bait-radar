import { Link } from "react-router-dom"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LikelihoodBadge, SentimentBadge } from "@/components/meta-badges"
import { mockVideos } from "@/data/mock"

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${n}`
}

export function VideoGrid() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-4xl">Analyzed Videos</h1>
        <p className="mt-1 text-foreground/70">Latest uploads across your tracked channels, scored for bait.</p>
      </header>

      {/* 3 per row on desktop */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {mockVideos.map((v) => (
          <Link
            key={v.id}
            to={`/videos/${v.id}`}
            className="transition-all hover:-translate-x-boxShadowX hover:-translate-y-boxShadowY hover:[&>*]:shadow-none"
          >
            <Card className="h-full gap-0 overflow-hidden py-0">
              {/* Thumbnail placeholder */}
              <div
                className="relative flex h-40 items-center justify-center border-b-2 border-border"
                style={{ backgroundColor: v.thumbnailColor }}
              >
                <span className="font-heading text-5xl opacity-30">▶</span>
                <Badge className="absolute right-2 top-2 bg-foreground font-heading text-background">
                  {v.clickbait_percentage}%
                </Badge>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <h3 className="font-heading text-base leading-snug line-clamp-2">{v.title}</h3>
                <p className="text-xs font-heading uppercase tracking-wide text-foreground/55">
                  {v.channelTitle} · {formatViews(v.views)} views
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <LikelihoodBadge value={v.likelihood} />
                  <SentimentBadge value={v.comment_sentiment} />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
