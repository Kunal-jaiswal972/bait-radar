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
  url?: string
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
  views: number
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

export interface SentimentDistribution {
  positive: number
  negative: number
  neutral: number
  mixed: number
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
}

export interface VideoDetail extends VideoCard {
  description: string
  duration: string
  transcript_status: TranscriptStatus
  pillars: PillarBreakdown
  betrayal_detail: BetrayalDetail
  thumbnail: {
    ocr_text: string[]
    tags: string[]
    objects: string[]
  }
  comment_sentiment_overall: Sentiment
  comment_sentiment_distribution: SentimentDistribution
  timeline: TimelinePoint[]
  comments: CommentItem[]
}

export interface RegisterChannelResult {
  channelId: string
  hubSubscriptionStatus: SubStatus
  subscriptionRequested: boolean
}
