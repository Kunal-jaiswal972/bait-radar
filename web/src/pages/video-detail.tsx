import { Link, useParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LikelihoodBadge, SentimentBadge } from "@/components/meta-badges"
import { ScoreMeter } from "@/components/score-meter"
import { InfoTip } from "@/components/shared/info-tip"
import { EngagementChart } from "@/components/charts/engagement-chart"
import { SentimentDonut } from "@/components/charts/sentiment-donut"
import { ErrorState, LoadingState } from "@/components/shared/query-state"
import { useVideoDetail } from "@/lib/queries"
import { formatCompact, formatDuration } from "@/lib/format"
import type { VideoDetail } from "@/data/types"

const PILLAR_TIPS = {
  packaging:
    "How sensational the title, description and thumbnail are — scored by a heuristic and a multimodal AI model that also looks at the thumbnail image.",
  mismatch:
    "The gap between what the title/thumbnail promise and what the video actually delivers, judged from the transcript. Higher means a bigger gap.",
  betrayal:
    "How many commenters call the video out as clickbait or say it didn't deliver — from a betrayal lexicon plus aspect-based opinion mining.",
} as const

export function VideoDetailPage() {
  const { id } = useParams()
  const detailQuery = useVideoDetail(id)

  if (detailQuery.isLoading) return <PageShell><LoadingState label="Loading video…" /></PageShell>
  if (detailQuery.isError) return <PageShell><ErrorState message={detailQuery.error.message} /></PageShell>
  if (!detailQuery.data) return <PageShell><ErrorState message="Video not found." /></PageShell>

  return <PageShell><VideoDetailView video={detailQuery.data} /></PageShell>
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <Button asChild variant="neutral" className="font-heading uppercase">
        <Link to="/videos">← Back to videos</Link>
      </Button>
      {children}
    </div>
  )
}

function VideoDetailView({ video }: { video: VideoDetail }) {
  const { pillars, comment_sentiment_distribution: dist } = video

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="overflow-hidden rounded-base border-2 border-border shadow-shadow">
          <div className="aspect-video w-full">
            <iframe
              src={`https://www.youtube.com/embed/${video.videoId}`}
              title={video.title}
              className="size-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>

        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-4">
            <div className="space-y-2">
              <h1 className="font-heading text-2xl leading-tight">{video.title}</h1>
              <p className="text-sm font-heading uppercase tracking-wide text-foreground/55">
                {video.channelTitle || video.channelId} · {formatCompact(video.views)} views
              </p>
              <p className="line-clamp-4 text-sm text-foreground/75">{video.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <LikelihoodBadge value={video.likelihood} />
              <SentimentBadge value={video.comment_sentiment} />
              {formatDuration(video.duration) && (
                <Badge variant="neutral" className="font-heading">⏱ {formatDuration(video.duration)}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl">Bait Score</h2>
              <span className="font-heading text-4xl">{video.clickbait_percentage}%</span>
            </div>
            <PillarMeter label="Packaging bait" tip={PILLAR_TIPS.packaging} value={toPct(pillars.packaging)} />
            {pillars.mismatch.available ? (
              <PillarMeter
                label="Promise–payoff mismatch"
                tip={PILLAR_TIPS.mismatch}
                value={toPct(pillars.mismatch.score)}
              />
            ) : (
              <UnavailablePillar label="Promise–payoff mismatch" tip={PILLAR_TIPS.mismatch} />
            )}
            <PillarMeter label="Audience betrayal" tip={PILLAR_TIPS.betrayal} value={toPct(pillars.betrayal)} />
            <p className="border-t-2 border-dashed border-border pt-3 text-xs text-foreground/55">
              {video.betrayal_detail.flagged_count} of {video.betrayal_detail.total_comments} comments flagged as
              betrayed. Estimated from public packaging, content & audience reaction — it does not include watch-time,
              which only the creator can authorize.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-heading text-xl">🖼️ Thumbnail Forensics</h2>
            <Forensic label="OCR text" items={video.thumbnail.ocr_text} className="bg-bait-yellow" />
            <Forensic label="Vision tags" items={video.thumbnail.tags} className="bg-bait-blue" />
            <Forensic label="Objects" items={video.thumbnail.objects} className="bg-bait-green" />
          </CardContent>
        </Card>
      </div>

      {video.timeline.length > 0 && (
        <Card>
          <CardContent className="space-y-2">
            <h2 className="font-heading text-xl">📈 Engagement Velocity</h2>
            <p className="text-sm text-foreground/70">Views & likes captured over time.</p>
            <EngagementChart data={video.timeline} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-6 md:grid-cols-[260px_1fr]">
          <div>
            <h2 className="font-heading text-xl">💬 Comment Sentiment</h2>
            <SentimentDonut dist={dist} />
          </div>
          {video.comments.length > 0 ? (
            <ul className="space-y-3">
              {video.comments.map((c, i) => (
                <li
                  key={`${c.author}-${i}`}
                  className="rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-heading">@{c.author}</span>
                    <SentimentBadge value={c.sentiment} />
                  </div>
                  <p className="text-sm text-foreground/80">{c.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="self-center text-sm font-heading uppercase tracking-wide text-foreground/50">
              No comments collected.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function toPct(value: number): number {
  return Math.round(value * 100)
}

function PillarMeter({ label, tip, value }: { label: string; tip: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-heading uppercase tracking-wide">
        <span className="flex items-center gap-1.5">
          {label} <InfoTip label={label} text={tip} />
        </span>
        <span>{value}%</span>
      </div>
      <ScoreMeter value={value} />
    </div>
  )
}

function UnavailablePillar({ label, tip }: { label: string; tip: string }) {
  return (
    <div className="text-xs font-heading uppercase tracking-wide text-foreground/45">
      <span className="flex items-center gap-1.5">
        {label} <InfoTip label={label} text={tip} /> · unavailable (no transcript)
      </span>
    </div>
  )
}

function Forensic({ label, items, className }: { label: string; items: string[]; className: string }) {
  if (items.length === 0) {
    return (
      <div>
        <p className="mb-1.5 text-xs font-heading uppercase tracking-wide text-foreground/55">{label}</p>
        <p className="text-xs text-foreground/40">— none detected</p>
      </div>
    )
  }
  return (
    <div>
      <p className="mb-1.5 text-xs font-heading uppercase tracking-wide text-foreground/55">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <Badge key={it} className={`font-base ${className}`}>{it}</Badge>
        ))}
      </div>
    </div>
  )
}
