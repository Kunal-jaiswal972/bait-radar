import { useState } from "react"

import { Button } from "@/components/ui/button"
import { baitAvatarColor } from "@/lib/colors"
import { cn } from "@/lib/utils"
import type { Channel } from "@/data/types"

// Threshold above which chips are put in a scrollable container so they don't
// push other filters off screen with many tracked channels.
const SCROLL_THRESHOLD = 10

export function ChannelFilter({
  channels,
  value,
  onChange,
}: {
  channels: Channel[]
  value: string[]
  onChange: (channelIds: string[]) => void
}) {
  if (channels?.length === 0) return null

  function toggle(channelId: string): void {
    if (value.includes(channelId)) {
      onChange(value.filter((id) => id !== channelId))
    } else {
      onChange([...value, channelId])
    }
  }

  const scrollable = channels.length > SCROLL_THRESHOLD

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-heading uppercase tracking-wide text-foreground/55">Channels</span>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          scrollable && "max-h-28 overflow-y-auto pr-1",
        )}
      >
        <ChannelChip label="All" active={value.length === 0} onClick={() => onChange([])} />
        {channels.map((c) => (
          <ChannelChip
            key={c.channelId}
            label={c.title}
            thumbnailUrl={c.thumbnailUrl}
            seed={c.channelId}
            active={value.includes(c.channelId)}
            onClick={() => toggle(c.channelId)}
          />
        ))}
      </div>
    </div>
  )
}

function ChannelChip({
  label,
  thumbnailUrl,
  seed,
  active,
  onClick,
}: {
  label: string
  thumbnailUrl?: string
  seed?: string
  active: boolean
  onClick: () => void
}) {
  const [imgBroken, setImgBroken] = useState(false)
  const showImg = Boolean(thumbnailUrl) && !imgBroken

  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "neutral"}
      aria-pressed={active}
      onClick={onClick}
      className="h-auto py-1 pl-1 pr-3 text-xs font-heading uppercase tracking-wide"
    >
      {seed &&
        (showImg ? (
          <img
            src={thumbnailUrl}
            alt=""
            onError={() => setImgBroken(true)}
            className="size-5 rounded-full border border-border object-cover"
          />
        ) : (
          <span
            className="flex size-5 items-center justify-center rounded-full border border-border text-[10px] text-white"
            style={{ backgroundColor: baitAvatarColor(seed) }}
          >
            {label.charAt(0).toUpperCase()}
          </span>
        ))}
      <span className="max-w-[10rem] truncate">{label}</span>
    </Button>
  )
}
