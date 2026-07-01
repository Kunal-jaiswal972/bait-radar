import { type ReactNode, useState } from "react"

// Renders a YouTube description readably: preserves line breaks, turns URLs into
// clickable links, and collapses long text behind a "Show more" toggle. No HTML
// injection — text is split and rebuilt as React nodes.

const COLLAPSED_CHARS = 360

function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    part.startsWith("http") ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="font-heading break-all underline underline-offset-2 hover:text-bait-blue"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

export function VideoDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const trimmed = text?.trim() ?? ""

  if (!trimmed) {
    return <p className="text-sm text-foreground/50">No description provided.</p>
  }

  const isLong = trimmed?.length > COLLAPSED_CHARS
  const shown = expanded || !isLong ? trimmed : `${trimmed.slice(0, COLLAPSED_CHARS).trimEnd()}…`

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80">
        {linkify(shown)}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-heading uppercase tracking-wide text-foreground/60 underline underline-offset-2 transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}
