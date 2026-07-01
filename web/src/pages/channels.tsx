import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ExternalLink, Hourglass, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MetaBadge } from "@/components/meta-badges"
import { ScoreMeter } from "@/components/score-meter"
import { ChannelBaitChart } from "@/components/charts/channel-bait-chart"
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/query-state"
import { useChannels, useRegisterChannel } from "@/lib/queries"
import { baitAvatarColor } from "@/lib/colors"
import { formatCompact } from "@/lib/format"
import type { Channel } from "@/data/types"

// Reject obvious video links — only channels are tracked (videos arrive via the
// webhook + backfill).
const VIDEO_LINK = /youtube\.com\/watch|youtu\.be\/|[?&]v=/i

export function Channels() {
  const channelsQuery = useChannels()
  const register = useRegisterChannel()
  const [url, setUrl] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  function addChannel(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    if (VIDEO_LINK.test(trimmed)) {
      setFormError("That looks like a video link. Paste a channel URL, @handle, or ID instead.")
      return
    }
    setFormError(null)
    register.mutate(trimmed, {
      onSuccess: () => setUrl(""),
      onError: (err) => setFormError(err.message),
    })
  }

  const channels = channelsQuery.data ?? []

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-heading text-4xl">Tracked Channels</h1>
        <p className="mt-1 text-foreground/70">Add a channel and BaitRadar subscribes to its uploads feed.</p>
      </header>

      <Card>
        <CardContent className="space-y-2">
          <form onSubmit={addChannel} className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/@channel  or  @handle"
              className="flex-1"
              disabled={register.isPending}
            />
            <Button
              type="submit"
              variant="neutral"
              className="font-heading uppercase"
              disabled={register.isPending}
            >
              {register.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Tracking…
                </>
              ) : (
                "+ Track channel"
              )}
            </Button>
          </form>
          {formError && <p className="text-sm font-heading text-bait-red">{formError}</p>}
        </CardContent>
      </Card>

      {channelsQuery.isLoading ? (
        <LoadingState label="Loading channels…" />
      ) : channelsQuery.isError ? (
        <ErrorState message={channelsQuery.error.message} />
      ) : channels?.length === 0 ? (
        <EmptyState message="No channels tracked yet — add one above." />
      ) : (
        <>
          {channels?.some((c) => c.clickbait) && (
            <Card>
              <CardContent className="space-y-2">
                <h2 className="font-heading text-xl">Clickbait propensity by channel</h2>
                <ChannelBaitChart channels={channels} />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-5">
            {channels.map((c) => (
              <ChannelRow key={c.channelId} channel={c} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ChannelRow({ channel }: { channel: Channel }) {
  const navigate = useNavigate()
  const [imgBroken, setImgBroken] = useState(false)
  const showImg = Boolean(channel.thumbnailUrl) && !imgBroken

  const goToVideos = () => navigate(`/videos?channel=${encodeURIComponent(channel.channelId)}`)

  const meta = [
    channel.handle ?? null,
    channel.subscriberCount ? `${formatCompact(channel.subscriberCount)} subscribers` : null,
    channel.videoCount ? `${formatCompact(channel.videoCount)} videos` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={goToVideos}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          goToVideos()
        }
      }}
      title="View this channel's analyzed videos"
      className="cursor-pointer transition-all hover:-translate-x-boxShadowX hover:-translate-y-boxShadowY hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Avatar — hover reveals a link to open the channel on YouTube. */}
        <div className="group/thumb relative size-16 shrink-0">
          {showImg ? (
            <img
              src={channel.thumbnailUrl}
              alt={channel.title}
              onError={() => setImgBroken(true)}
              className="size-16 rounded-base border-2 border-border object-cover shadow-shadow"
            />
          ) : (
            <div
              className="flex size-16 items-center justify-center rounded-base border-2 border-border font-heading text-2xl text-white shadow-shadow"
              style={{ backgroundColor: baitAvatarColor(channel.channelId) }}
            >
              {channel.title.charAt(0).toUpperCase()}
            </div>
          )}
          <a
            href={channel.channelUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Open ${channel.title} on YouTube`}
            title="Open on YouTube"
            className="absolute inset-0 grid place-items-center rounded-base bg-black/55 opacity-0 transition-opacity group-hover/thumb:opacity-100"
          >
            <ExternalLink className="size-5 text-white" />
          </a>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-xl">{channel.title}</h3>
          <p className="truncate text-sm text-foreground/60">{meta}</p>

          {channel.clickbait ? (
            <div className="mt-3 max-w-md">
              <ScoreMeter value={channel.clickbait.propensity_percentage} label="Clickbait propensity" />
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-heading uppercase tracking-wide text-foreground/50">
              <Hourglass className="size-3.5" /> Awaiting first analysis…
            </p>
          )}
        </div>

        {channel.clickbait && (
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <MetaBadge kind="likelihood" value={channel.clickbait.likelihood} />
            <MetaBadge kind="trend" value={channel.clickbait.trend} />
            <span className="text-xs font-heading uppercase tracking-wide text-foreground/50">
              {channel.clickbait.video_count} videos
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
