import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LikelihoodBadge, StatusBadge, TrendBadge } from "@/components/meta-badges"
import { ScoreMeter } from "@/components/score-meter"
import { ChannelBaitChart } from "@/components/charts/channel-bait-chart"
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/query-state"
import { useChannels, useRegisterChannel } from "@/lib/queries"
import { baitAvatarColor } from "@/lib/colors"
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

      <Card className="bg-main">
        <CardContent className="space-y-2">
          <form onSubmit={addChannel} className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/@channel  or  @handle  or  UC…"
              className="flex-1"
              disabled={register.isPending}
            />
            <Button
              type="submit"
              variant="neutral"
              className="font-heading uppercase"
              disabled={register.isPending}
            >
              {register.isPending ? "Tracking…" : "+ Track channel"}
            </Button>
          </form>
          {formError && <p className="text-sm font-heading text-bait-red">{formError}</p>}
        </CardContent>
      </Card>

      {channelsQuery.isLoading ? (
        <LoadingState label="Loading channels…" />
      ) : channelsQuery.isError ? (
        <ErrorState message={channelsQuery.error.message} />
      ) : channels.length === 0 ? (
        <EmptyState message="No channels tracked yet — add one above." />
      ) : (
        <>
          {channels.some((c) => c.clickbait) && (
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
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-base border-2 border-border font-heading text-2xl text-white shadow-shadow"
          style={{ backgroundColor: baitAvatarColor(channel.channelId) }}
        >
          {channel.title.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-xl">{channel.title}</h3>
            <StatusBadge value={channel.hubSubscriptionStatus} />
          </div>
          <p className="text-sm text-foreground/60">{channel.channelId}</p>

          {channel.clickbait ? (
            <div className="mt-3 max-w-md">
              <ScoreMeter value={channel.clickbait.propensity_percentage} label="Clickbait propensity" />
            </div>
          ) : (
            <p className="mt-3 text-sm font-heading uppercase tracking-wide text-foreground/50">
              ⏳ Awaiting first analysis…
            </p>
          )}
        </div>

        {channel.clickbait && (
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <LikelihoodBadge value={channel.clickbait.likelihood} />
            <TrendBadge value={channel.clickbait.trend} />
            <span className="text-xs font-heading uppercase tracking-wide text-foreground/50">
              {channel.clickbait.video_count} videos
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
