// Frontend-facing types — a mirror of the backend dashboard DTOs in
// ../../../src/types/dashboard.ts. Kept in sync by hand (the web app is a
// separate workspace and doesn't import the backend's zod schemas).

export type Likelihood =
  | "Least Likely"
  | "Less Likely"
  | "Normal"
  | "Highly Likely"
  | "Most Likely"

export type Sentiment = "Positive" | "Negative" | "Neutral" | "Mixed"
export type Trend = "rising" | "falling" | "stable"
export type SubStatus = "pending" | "verified" | "failed"
export type TranscriptStatus = "success" | "failed_retryable" | "manual_override"

export interface ChannelClickbait {
  propensity_percentage: number
  likelihood: Likelihood
  flagged_pct: number
  video_count: number
  avg_betrayal_rate: number
  trend: Trend
  updated_at: string
}

export interface Channel {
  channelId: string
  title: string
  handle?: string
  description?: string
  thumbnailUrl?: string
  channelUrl: string
  subscriberCount?: number
  videoCount?: number
  hubSubscriptionStatus: SubStatus
  clickbait?: ChannelClickbait
  createdAt: string
}

export interface VideoCard {
  videoId: string
  channelId: string
  channelTitle: string
  title: string
  thumbnailUrl: string
  videoUrl: string
  publishedAt: string
  duration: string
  views: number
  likes: number
  clickbait_percentage: number
  likelihood: Likelihood
  comment_sentiment: Sentiment
}

export interface MismatchPillarView {
  available: boolean
  score: number // 0..1
}

export interface PillarBreakdown {
  packaging: number // 0..1
  mismatch: MismatchPillarView
  betrayal: number // 0..1
}

export interface BetrayalDetail {
  betrayal_rate: number
  flagged_count: number
  total_comments: number
}

export interface ThumbnailSignals {
  ocr_text: string[]
  tags: string[]
  objects: string[]
}

export interface SentimentDistribution {
  positive: number
  negative: number
  neutral: number
  mixed: number
}

// All per-video analysis, grouped so each datapoint appears exactly once.
export interface VideoInsightsView {
  pillars: PillarBreakdown
  betrayal: BetrayalDetail
  comment: {
    overall: Sentiment
    distribution: SentimentDistribution
  }
  transcript: {
    sentiment: Sentiment
  }
  thumbnail: ThumbnailSignals
}

export interface TimelinePoint {
  timestamp: string
  views: number
  likes: number
  comments: number
}

export interface CommentItem {
  author: string
  text: string
  sentiment: Sentiment
  publishedAt: string
}

export interface TranscriptLine {
  start: number
  text: string
}

export interface VideoDetail extends VideoCard {
  description: string
  transcript_status: TranscriptStatus
  transcript: TranscriptLine[]
  insights: VideoInsightsView
  timeline: TimelinePoint[]
  comments: CommentItem[]
}

export interface RegisterChannelResult {
  channelId: string
  hubSubscriptionStatus: SubStatus
  subscriptionRequested: boolean
}
