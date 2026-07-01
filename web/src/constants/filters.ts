import type { Likelihood, Sentiment } from "@/data/types"

// Shared sort/filter option sets + limits for the comment and video views. Kept
// here (not inline in pages/components) so the two views stay consistent and the
// option lists have a single source of truth.

// Option shape consumed by the FilterPills control.
export interface FilterOption<T extends string> {
  value: T
  label: string
}

/* ----- Comments ----- */

export type CommentSortKey = "newest" | "oldest" | "author"

export const COMMENT_SORT_OPTIONS: ReadonlyArray<FilterOption<CommentSortKey>> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "author", label: "A–Z" },
]

export const COMMENTS_PAGE_SIZE = 20

/* ----- Videos ----- */

export type VideoSortKey = "newest" | "oldest" | "views" | "bait" | "title"

export const VIDEO_SORT_OPTIONS: ReadonlyArray<FilterOption<VideoSortKey>> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "views", label: "Most views" },
  { value: "bait", label: "Most bait" },
  { value: "title", label: "A–Z" },
]

// Backend caps a page at 200; we pull the full recent set so client-side channel
// + bait + mood filtering has everything to work with.
export const VIDEOS_QUERY_LIMIT = 200

/* ----- Shared filters ----- */

export type SentimentFilter = "all" | Sentiment

export const SENTIMENT_FILTER_OPTIONS: ReadonlyArray<FilterOption<SentimentFilter>> = [
  { value: "all", label: "All" },
  { value: "Positive", label: "Positive" },
  { value: "Negative", label: "Negative" },
  { value: "Neutral", label: "Neutral" },
  { value: "Mixed", label: "Mixed" },
]

export type BaitFilter = "all" | "low" | "normal" | "high"

export const BAIT_FILTER_OPTIONS: ReadonlyArray<FilterOption<BaitFilter>> = [
  { value: "all", label: "All" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
]

// Maps a video's likelihood label to its coarse bait bucket for filtering.
export const BAIT_BUCKET: Record<Likelihood, Exclude<BaitFilter, "all">> = {
  "Least Likely": "low",
  "Less Likely": "low",
  Normal: "normal",
  "Highly Likely": "high",
  "Most Likely": "high",
}
