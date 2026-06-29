import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LikelihoodBadge, StatusBadge, TrendBadge } from "@/components/meta-badges"
import { ScoreMeter } from "@/components/score-meter"
import { ChannelBaitChart } from "@/components/charts/channel-bait-chart"
import { mockChannels } from "@/data/mock"
import type { Channel } from "@/data/types"

export function Channels() {
  const [channels, setChannels] = useState<Channel[]>(mockChannels)
  const [url, setUrl] = useState("")

  function addChannel(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    const handle =
      trimmed.replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/\/.*$/, "") || trimmed
    const id = `UC_local_${channels.length}`
    setChannels((prev) => [
      {
        id,
        channelId: id,
        title: handle.replace(/^@/, "").replace(/^\w/, (c) => c.toUpperCase()),
        handle: handle.startsWith("@") ? handle : `@${handle}`,
        url: trimmed,
        avatarColor: "var(--color-bait-orange)",
        hubSubscriptionStatus: "pending",
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ])
    setUrl("")
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-heading text-4xl">Tracked Channels</h1>
        <p className="mt-1 text-foreground/70">Add a channel and BaitRadar subscribes to its uploads feed.</p>
      </header>

      {/* Add channel */}
      <Card className="bg-main">
        <CardContent>
          <form onSubmit={addChannel} className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/@channel  or  @handle"
              className="flex-1"
            />
            <Button type="submit" variant="neutral" className="font-heading uppercase">
              + Track channel
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Comparison chart */}
      <Card>
        <CardContent className="space-y-2">
          <h2 className="font-heading text-xl">Clickbait propensity by channel</h2>
          <ChannelBaitChart channels={channels} />
        </CardContent>
      </Card>

      {/* Channel list */}
      <div className="grid gap-5">
        {channels.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div
                className="flex size-16 shrink-0 items-center justify-center rounded-base border-2 border-border font-heading text-2xl text-white shadow-shadow"
                style={{ backgroundColor: c.avatarColor }}
              >
                {c.title.charAt(0)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-xl">{c.title}</h3>
                  <StatusBadge value={c.hubSubscriptionStatus} />
                </div>
                <p className="text-sm text-foreground/60">{c.handle}</p>

                {c.clickbait ? (
                  <div className="mt-3 max-w-md">
                    <ScoreMeter value={c.clickbait.propensity_percentage} label="Clickbait propensity" />
                  </div>
                ) : (
                  <p className="mt-3 text-sm font-heading uppercase tracking-wide text-foreground/50">
                    ⏳ Awaiting first analysis…
                  </p>
                )}
              </div>

              {c.clickbait && (
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <LikelihoodBadge value={c.clickbait.likelihood} />
                  <TrendBadge value={c.clickbait.trend} />
                  <span className="text-xs font-heading uppercase tracking-wide text-foreground/50">
                    {c.clickbait.video_count} videos
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
