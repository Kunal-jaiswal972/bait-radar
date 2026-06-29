// Frontend-facing types — a trimmed mirror of the backend Zod schemas in
// ../../../src/types so the mock data can later be swapped for a real API.

export type Likelihood =
  | "Least Likely"
  | "Less Likely"
  | "Normal"
  | "Highly Likely"
  | "Most Likely";

export type Sentiment = "Positive" | "Negative" | "Neutral" | "Mixed";
export type Trend = "rising" | "falling" | "stable";
export type SubStatus = "pending" | "verified" | "failed";

export interface ChannelClickbait {
  propensity_percentage: number;
  likelihood: Likelihood;
  flagged_pct: number;
  video_count: number;
  avg_betrayal_rate: number;
  trend: Trend;
  updated_at: string;
}

export interface Channel {
  id: string;
  channelId: string;
  title: string;
  handle: string;
  url: string;
  avatarColor: string; // UI-only, for the brutalist avatar tile
  hubSubscriptionStatus: SubStatus;
  clickbait?: ChannelClickbait;
  createdAt: string;
}

export interface VideoCard {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  thumbnailColor: string; // UI-only placeholder for the thumbnail tile
  publishedAt: string;
  views: number;
  clickbait_percentage: number;
  likelihood: Likelihood;
  comment_sentiment: Sentiment;
}

// One snapshot in the engagement-velocity time series (mirrors the backend
// timeline points: views/likes/comments captured over time).
export interface TimelinePoint {
  t: string; // human label, e.g. "0h", "6h"
  views: number;
  likes: number;
  comments: number;
}

export interface VideoDetail extends VideoCard {
  description: string;
  duration: string;
  timeline: TimelinePoint[];
  pillars: {
    packaging: number; // 0..1
    mismatch: number; // 0..1
    betrayal: number; // 0..1
  };
  thumbnail: {
    ocr_text: string[];
    tags: string[];
    objects: string[];
  };
  sentiment_distribution: {
    positive: number;
    negative: number;
    neutral: number;
    mixed: number;
  };
  comments: { author: string; text: string; sentiment: Sentiment }[];
}
