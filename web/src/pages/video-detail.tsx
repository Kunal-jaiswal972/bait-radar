import { Link, useParams } from "react-router-dom"
import { Activity, ArrowLeft, Calendar, Clock, Eye, MessageSquare, ThumbsUp, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MetaBadge } from "@/components/meta-badges"
import { BaitDial } from "@/components/bait-dial"
import { ScoreMeter } from "@/components/score-meter"
import { InfoTip } from "@/components/shared/info-tip"
import { VideoDescription } from "@/components/video/video-description"
import { ScoreBreakdown } from "@/components/video/score-breakdown"
import { VideoActions } from "@/components/video/video-actions"
import { TranscriptPanel } from "@/components/video/transcript-panel"
import { CommentsPanel } from "@/components/video/comments-panel"
import { EngagementChart } from "@/components/charts/engagement-chart"
import { SentimentDonut } from "@/components/charts/sentiment-donut"
import { ErrorState, LoadingState } from "@/components/shared/query-state"
import { useVideoDetail } from "@/lib/queries"
import { formatCompact, formatDate, formatDuration } from "@/lib/format"
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
        <Link to="/videos">
          <ArrowLeft className="size-4" /> Back to videos
        </Link>
      </Button>
      {children}
    </div>
  )
}

function VideoDetailView({ video }: { video: VideoDetail }) {
  const insights = video.insights
  const pillars = insights?.pillars
  const dist = insights?.comment?.distribution

  // Availability flags — each analysis dimension can be missing (no transcript,
  // no comments, no timeline yet). We surface "Unavailable" rather than hiding
  // the section or showing a misleading zero / default value.
  const hasTranscript = (video.transcript?.length ?? 0) > 0
  const hasComments = (video.comments?.length ?? 0) > 0

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="self-start overflow-hidden rounded-base border-2 border-border shadow-shadow">
          <div className="aspect-video w-full">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.videoId}`}
              title={video.title}
              className="size-full"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>

        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-5">
            <div className="space-y-3">
              <div className="space-y-1">
                <h1 className="font-heading text-2xl leading-tight">{video.title}</h1>
                <p className="text-sm font-heading text-foreground/60">
                  {video.channelTitle || video.channelId}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Stat icon={Eye} value={formatCompact(video.views)} label="Views" />
                {video.likes > 0 && (
                  <Stat icon={ThumbsUp} value={formatCompact(video.likes)} label="Likes" />
                )}
                <Stat icon={Calendar} value={formatDate(video.publishedAt)} label="Published" />
                {formatDuration(video.duration) && (
                  <Stat icon={Clock} value={formatDuration(video.duration)} label="Length" />
                )}
              </div>
            </div>
            <div className="flex items-center gap-8">
              <BaitDial value={video.clickbait_percentage} />
              <div className="flex flex-col gap-2">
                <LabeledBadge caption="Clickbait">
                  <MetaBadge kind="likelihood" value={video.likelihood} />
                </LabeledBadge>
                <LabeledBadge caption="Comment mood">
                  {hasComments && insights?.comment?.overall ? (
                    <MetaBadge kind="sentiment" value={insights.comment.overall} />
                  ) : (
                    <Unavailable />
                  )}
                </LabeledBadge>
                <LabeledBadge caption="Transcript tone">
                  {hasTranscript && insights?.transcript?.sentiment ? (
                    <MetaBadge kind="sentiment" value={insights.transcript.sentiment} />
                  ) : (
                    <Unavailable />
                  )}
                </LabeledBadge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-2">
          <h2 className="font-heading text-xl">Description</h2>
          <VideoDescription text={video.description} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl">Bait Score</h2>
              <span className="font-heading text-4xl">{video.clickbait_percentage}%</span>
            </div>
            <PillarMeter label="Packaging bait" tip={PILLAR_TIPS.packaging} value={toPct(pillars?.packaging)} />
            {pillars?.mismatch?.available ? (
              <PillarMeter
                label="Promise–payoff mismatch"
                tip={PILLAR_TIPS.mismatch}
                value={toPct(pillars.mismatch.score)}
              />
            ) : (
              <UnavailablePillar label="Promise–payoff mismatch" tip={PILLAR_TIPS.mismatch} />
            )}
            <PillarMeter label="Audience betrayal" tip={PILLAR_TIPS.betrayal} value={toPct(pillars?.betrayal)} />
            <p className="text-xs text-foreground/55">
              {hasComments
                ? `${insights?.betrayal?.flagged_count ?? 0} of ${insights?.betrayal?.total_comments ?? 0} comments flagged as betrayed.`
                : "No comments collected — betrayal has no signal."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <h2 className="flex items-center gap-2 font-heading text-xl">
              <MessageSquare className="size-5" /> Comment Sentiment
            </h2>
            <SentimentDonut dist={dist} />
          </CardContent>
        </Card>
      </div>

      <ScoreBreakdown video={video} />

      <VideoActions videoId={video.videoId} transcriptStatus={video.transcript_status} />

      <Card>
        <CardContent className="space-y-2">
          <h2 className="flex items-center gap-2 font-heading text-xl">
            <Activity className="size-5" /> Engagement Velocity
          </h2>
          <p className="text-sm text-foreground/70">Views, likes and comments captured over time.</p>
          <EngagementChart data={video?.timeline} />
        </CardContent>
      </Card>

      <TranscriptPanel lines={video?.transcript} sentiment={insights?.transcript?.sentiment} />

      <Card>
        <CardContent className="space-y-4">
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-xl">
            <MessageSquare className="size-5" /> Comments
            {hasComments && insights?.comment?.overall && (
              <MetaBadge kind="sentiment" value={insights.comment.overall} />
            )}
          </h2>
          <CommentsPanel comments={video.comments} />
        </CardContent>
      </Card>
    </div>
  )
}

function toPct(value: number | undefined): number {
  return Math.round((value ?? 0) * 100)
}

// A muted chip shown when a datapoint couldn't be computed (no transcript, no
// comments, etc.) — clearer than a misleading zero or default value.
function Unavailable() {
  return (
    <Badge variant="neutral" className="font-base uppercase tracking-wide text-foreground/45">
      Unavailable
    </Badge>
  )
}

// A single labeled stat (icon + value + caption) for the video's info card.
function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-base border-2 border-border bg-secondary-background">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-heading">{value}</span>
        <span className="text-[0.6rem] font-heading uppercase tracking-widest text-foreground/50">{label}</span>
      </span>
    </div>
  )
}

// A captioned badge row (fixed-width caption so the badges align) used beside the
// bait dial for likelihood / comment mood / transcript tone.
function LabeledBadge({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[0.6rem] font-heading uppercase tracking-widest text-foreground/50">
        {caption}
      </span>
      {children}
    </span>
  )
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

// Same layout as PillarMeter, but with an "Unavailable" marker and an empty
// (dashed) meter track — so the pillar reads consistently instead of looking
// missing when it can't be scored.
function UnavailablePillar({ label, tip, reason = "no transcript" }: { label: string; tip: string; reason?: string }) {
  return (
    <div className="opacity-60">
      <div className="mb-1 flex items-center justify-between text-xs font-heading uppercase tracking-wide">
        <span className="flex items-center gap-1.5">
          {label} <InfoTip label={label} text={tip} />
        </span>
        <span className="text-foreground/50">Unavailable</span>
      </div>
      <div className="h-5 w-full rounded-base border-2 border-dashed border-border bg-secondary-background" />
      <p className="mt-1 text-[0.65rem] font-heading uppercase tracking-wide text-foreground/40">({reason})</p>
    </div>
  )
}
