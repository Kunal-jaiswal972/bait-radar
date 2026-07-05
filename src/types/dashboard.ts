import type { ChannelClickbait, HubSubscriptionStatus } from "./channel";
import type { Likelihood, Sentiment, TranscriptStatus } from "./common";

// User-facing API contracts (DTOs) the dashboard consumes. These intentionally
// omit model internals (heuristic/llm packaging sub-scores, effective weights) —
// only the final merged pillar scores are exposed. Produced by
// domain/dashboardMappers from the persisted Cosmos documents.

export interface ChannelSummary {
  channelId: string;
  title: string;
  handle?: string; // canonical "@handle"
  description?: string;
  thumbnailUrl?: string;
  channelUrl: string; // canonical YouTube link for "open channel"
  subscriberCount?: number;
  videoCount?: number;
  hubSubscriptionStatus: HubSubscriptionStatus;
  clickbait?: ChannelClickbait;
  createdAt: string;
}

export interface VideoCard {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  publishedAt: string;
  duration: string; // ISO 8601, e.g. "PT10M30S"
  views: number;
  likes: number;
  clickbait_percentage: number;
  likelihood: Likelihood;
  comment_sentiment: Sentiment;
}

export interface MismatchPillarView {
  available: boolean;
  score: number; // 0..1
}

// Betrayal mirrors mismatch: unavailable until the ~6h comment pass has run.
export interface BetrayalPillarView {
  available: boolean;
  score: number; // 0..1
}

export interface PillarBreakdown {
  packaging: number; // 0..1
  mismatch: MismatchPillarView;
  betrayal: BetrayalPillarView;
}

export interface BetrayalDetail {
  betrayal_rate: number;
  flagged_count: number;
  total_comments: number;
}

export interface SentimentDistribution {
  positive: number;
  negative: number;
  neutral: number;
  mixed: number;
}

// All per-video analysis, grouped in one place so each datapoint is returned
// exactly once: the three clickbait pillar scores, the betrayal counts behind the
// betrayal pillar, comment sentiment, and transcript sentiment.
export interface VideoInsightsView {
  pillars: PillarBreakdown;
  betrayal: BetrayalDetail;
  comment: {
    overall: Sentiment;
    distribution: SentimentDistribution;
  };
  transcript: {
    sentiment: Sentiment;
  };
}

export interface TimelineDto {
  timestamp: string;
  views: number;
  likes: number;
  comments: number;
}

export interface CommentDto {
  author: string;
  text: string;
  sentiment: Sentiment;
  publishedAt: string;
}

export interface TranscriptLine {
  start: number; // seconds from the start of the video
  text: string;
}

export interface VideoDetail extends VideoCard {
  description: string;
  transcript_status: TranscriptStatus;
  // True when the ~6h comment pass hasn't run yet — the UI shows "pending" for
  // betrayal + comment sentiment instead of a misleading zero.
  comments_pending: boolean;
  transcript: TranscriptLine[];
  insights: VideoInsightsView;
  timeline: TimelineDto[];
  comments: CommentDto[];
}
