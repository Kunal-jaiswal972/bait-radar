import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MetaBadge } from "@/components/meta-badges"
import { FilterPills } from "@/components/shared/filter-pills"
import {
  COMMENTS_PAGE_SIZE,
  COMMENT_SORT_OPTIONS,
  SENTIMENT_FILTER_OPTIONS,
  type CommentSortKey,
  type SentimentFilter,
} from "@/constants/filters"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CommentItem } from "@/data/types"

// Comment list with client-side search, sentiment filter, sort, and progressive
// "load more". All stored comments (≤200) arrive in the detail payload, so this
// is pure local state — no extra round-trips.

export function CommentsPanel({ comments }: { comments: CommentItem[] }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<CommentSortKey>("newest")
  const [sentiment, setSentiment] = useState<SentimentFilter>("all")
  const [visible, setVisible] = useState(COMMENTS_PAGE_SIZE)

  // Reset pagination on the event that changes the result set (not in an effect,
  // which would cause a cascading re-render).
  function changeQuery(value: string): void {
    setQuery(value)
    setVisible(COMMENTS_PAGE_SIZE)
  }
  function changeSort(value: CommentSortKey): void {
    setSort(value)
    setVisible(COMMENTS_PAGE_SIZE)
  }
  function changeSentiment(value: SentimentFilter): void {
    setSentiment(value)
    setVisible(COMMENTS_PAGE_SIZE)
  }

  const filtered = useMemo(() => {
    const all = comments ?? []
    const q = query.trim().toLowerCase()
    const matches = all.filter((c) => {
      if (sentiment !== "all" && c.sentiment !== sentiment) return false
      if (q && !c.text.toLowerCase().includes(q) && !c.author.toLowerCase().includes(q)) return false
      return true
    })
    return matches.sort((a, b) => {
      if (sort === "author") return a.author.localeCompare(b.author)
      const ta = new Date(a.publishedAt).getTime()
      const tb = new Date(b.publishedAt).getTime()
      return sort === "newest" ? tb - ta : ta - tb
    })
  }, [comments, query, sort, sentiment])

  const totalComments = comments?.length ?? 0

  if (totalComments === 0) {
    return (
      <p className="text-sm font-heading uppercase tracking-wide text-foreground/50">
        No comments collected.
      </p>
    )
  }

  const shown = filtered.slice(0, visible)

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow">
        <Input
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          placeholder="Search comments or authors…"
          className="bg-background"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterPills label="Sort" options={COMMENT_SORT_OPTIONS} value={sort} onChange={changeSort} />
          <FilterPills
            label="Mood"
            hint="Filter comments by their sentiment — positive, negative, neutral or mixed."
            options={SENTIMENT_FILTER_OPTIONS}
            value={sentiment}
            onChange={changeSentiment}
          />
        </div>
      </div>

      <p className="text-xs font-heading uppercase tracking-wide text-foreground/55">
        Showing {shown.length} of {filtered.length}
        {filtered.length !== totalComments ? ` (filtered from ${totalComments})` : ""}
      </p>

      {filtered?.length === 0 ? (
        <p className="text-sm text-foreground/60">No comments match these filters.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((c, i) => (
            <li
              key={`${c.author}-${i}`}
              className="rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-heading">@{c.author}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-foreground/50">{formatDate(c.publishedAt)}</span>
                  <MetaBadge kind="sentiment" value={c.sentiment} />
                </div>
              </div>
              <CommentText text={c.text} />
            </li>
          ))}
        </ul>
      )}

      {visible < filtered?.length && (
        <Button
          type="button"
          variant="neutral"
          className="w-full font-heading uppercase"
          onClick={() => setVisible((v) => v + COMMENTS_PAGE_SIZE)}
        >
          Load more
        </Button>
      )}
    </div>
  )
}

// A comment body clamped to 3 lines with a Read more / Show less toggle. Overflow
// is measured once (scrollHeight vs clientHeight while clamped) so the toggle only
// appears for comments that actually exceed 3 lines.
function CommentText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [text])

  return (
    <div>
      <p
        ref={ref}
        className={cn(
          "whitespace-pre-wrap break-words text-sm text-foreground/80",
          !expanded && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-heading uppercase tracking-wide text-foreground/55 underline underline-offset-2 transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  )
}
