import { Link, useParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LikelihoodBadge, SentimentBadge } from "@/components/meta-badges"
import { ScoreMeter } from "@/components/score-meter"
import { EngagementChart } from "@/components/charts/engagement-chart"
import { SentimentDonut } from "@/components/charts/sentiment-donut"
import { getVideoDetail } from "@/data/mock"

export function VideoDetailPage() {
  const { id } = useParams()
  const v = getVideoDetail(id ?? "vid001")
  const dist = v.sentiment_distribution

  return (
    <div className="space-y-8">
      <Button asChild variant="neutral" className="font-heading uppercase">
        <Link to="/videos">← Back to videos</Link>
      </Button>

      {/* Header */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div
          className="flex h-56 items-center justify-center rounded-base border-2 border-border shadow-shadow"
          style={{ backgroundColor: v.thumbnailColor }}
        >
          <span className="font-heading text-7xl opacity-30">▶</span>
        </div>

        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-4">
            <div className="space-y-2">
              <h1 className="font-heading text-2xl leading-tight">{v.title}</h1>
              <p className="text-sm font-heading uppercase tracking-wide text-foreground/55">{v.channelTitle}</p>
              <p className="text-sm text-foreground/75">{v.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <LikelihoodBadge value={v.likelihood} />
              <SentimentBadge value={v.comment_sentiment} />
              <Badge variant="neutral" className="font-heading">
                ⏱ {v.duration.replace("PT", "").toLowerCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bait breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl">Bait Score</h2>
              <span className="font-heading text-4xl">{v.clickbait_percentage}%</span>
            </div>
            <ScoreMeter value={Math.round(v.pillars.packaging * 100)} label="Packaging bait" />
            <ScoreMeter value={Math.round(v.pillars.mismatch * 100)} label="Promise–payoff mismatch" />
            <ScoreMeter value={Math.round(v.pillars.betrayal * 100)} label="Audience betrayal" />
          </CardContent>
        </Card>

        {/* Thumbnail forensics */}
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-heading text-xl">🖼️ Thumbnail Forensics</h2>
            <Forensic label="OCR text" items={v.thumbnail.ocr_text} className="bg-bait-yellow" />
            <Forensic label="Vision tags" items={v.thumbnail.tags} className="bg-bait-blue" />
            <Forensic label="Objects" items={v.thumbnail.objects} className="bg-bait-green" />
          </CardContent>
        </Card>
      </div>

      {/* Engagement velocity */}
      <Card>
        <CardContent className="space-y-2">
          <h2 className="font-heading text-xl">📈 Engagement Velocity</h2>
          <p className="text-sm text-foreground/70">Views & likes since publish.</p>
          <EngagementChart data={v.timeline} />
        </CardContent>
      </Card>

      {/* Comment sentiment */}
      <Card>
        <CardContent className="grid gap-6 md:grid-cols-[260px_1fr]">
          <div>
            <h2 className="font-heading text-xl">💬 Comment Sentiment</h2>
            <SentimentDonut dist={dist} />
          </div>
          <ul className="space-y-3">
            {v.comments.map((c, i) => (
              <li key={i} className="rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-heading">@{c.author}</span>
                  <SentimentBadge value={c.sentiment} />
                </div>
                <p className="text-sm text-foreground/80">{c.text}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function Forensic({ label, items, className }: { label: string; items: string[]; className: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-heading uppercase tracking-wide text-foreground/55">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <Badge key={it} className={`font-base ${className}`}>
            {it}
          </Badge>
        ))}
      </div>
    </div>
  )
}
