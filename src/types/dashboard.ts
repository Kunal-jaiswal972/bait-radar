import type { ChannelClickbait, HubSubscriptionStatus } from "./channel";
import type { Likelihood, Sentiment, TranscriptStatus } from "./common";

// User-facing API contracts (DTOs) the dashboard consumes. These intentionally
// omit model internals (heuristic/llm sub-scores, effective weights) — only the
// three pillar scores are exposed. Produced by domain/dashboardMappers from the
// persisted Cosmos documents.

export interface ChannelSummary {
  channelId: string;
  title: string;
  url?: string;
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
  views: number;
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

export interface SentimentDistribution {
  positive: number;
  negative: number;
  neutral: number;
  mixed: number;
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
}

export interface VideoDetail extends VideoCard {
  description: string;
  duration: string;
  transcript_status: TranscriptStatus;
  pillars: PillarBreakdown;
  betrayal_detail: BetrayalDetail;
  thumbnail: {
    ocr_text: string[];
    tags: string[];
    objects: string[];
  };
  comment_sentiment_overall: Sentiment;
  comment_sentiment_distribution: SentimentDistribution;
  timeline: TimelineDto[];
  comments: CommentDto[];
}
