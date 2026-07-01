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

export interface PillarBreakdown {
  packaging: number; // 0..1
  mismatch: MismatchPillarView;
  betrayal: number; // 0..1
}

export interface BetrayalDetail {
  betrayal_rate: number;
  flagged_count: number;
  total_comments: number;
}

// Raw thumbnail signals from Azure AI Vision that feed the packaging score.
export interface ThumbnailSignals {
  ocr_text: string[];
  tags: string[];
  objects: string[];
}

export interface SentimentDistribution {
  positive: number;
  negative: number;
  neutral: number;
  mixed: number;
}

// All per-video analysis, grouped in one place so each datapoint is returned
// exactly once: the three clickbait pillar scores, the betrayal counts behind the
// betrayal pillar, comment sentiment, transcript sentiment, and thumbnail signals.
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
  thumbnail: ThumbnailSignals;
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
  transcript: TranscriptLine[];
  insights: VideoInsightsView;
  timeline: TimelineDto[];
  comments: CommentDto[];
}
