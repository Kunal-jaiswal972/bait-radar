import type {
  ChannelSummary,
  CommentDto,
  TimelineDto,
  VideoCard,
  VideoDetail,
} from "../types/dashboard";
import type { Channel, CommentRecord, TimelinePoint, VideoInsights } from "../types";

// Pure transforms from persisted Cosmos documents to the user-facing dashboard
// DTOs. No IO, no framework — safe to unit test in isolation. Model internals
// (heuristic/llm sub-scores, effective weights) are deliberately dropped here.

const DEFAULT_MAX_DETAIL_COMMENTS = 50;

/** Latest views from the engagement timeline (0 when none recorded yet). */
function latestViews(timeline: TimelinePoint[]): number {
  const last = timeline?.[timeline.length - 1];
  return last?.views ?? 0;
}

export function toChannelSummary(channel: Channel): ChannelSummary {
  return {
    channelId: channel.channelId,
    title: channel.title ?? channel.channelId,
    url: channel.url,
    hubSubscriptionStatus: channel.hubSubscriptionStatus,
    clickbait: channel.clickbait,
    createdAt: channel.createdAt,
  };
}

export function toVideoCard(doc: VideoInsights): VideoCard {
  const clickbait = doc.insights.clickbait;
  return {
    videoId: doc.id,
    channelId: doc.channelId,
    channelTitle: doc.metadata.channelTitle ?? "",
    title: doc.metadata.title,
    thumbnailUrl: doc.metadata.thumbnailUrl,
    videoUrl: doc.metadata.videoUrl,
    publishedAt: doc.publishedAt,
    views: latestViews(doc.timeline),
    clickbait_percentage: clickbait.clickbait_percentage,
    likelihood: clickbait.likelihood,
    comment_sentiment: doc.insights.comment_sentiment.overall,
  };
}

function toTimelineDto(point: TimelinePoint): TimelineDto {
  return {
    timestamp: point.timestamp,
    views: point.views,
    likes: point.likes ?? 0,
    comments: point.comments ?? 0,
  };
}

function toCommentDto(comment: CommentRecord): CommentDto {
  return {
    author: comment.author,
    text: comment.text,
    sentiment: comment.sentiment,
  };
}

export function toVideoDetail(
  doc: VideoInsights,
  options?: { maxComments?: number }
): VideoDetail {
  const maxComments = options?.maxComments ?? DEFAULT_MAX_DETAIL_COMMENTS;
  const clickbait = doc.insights.clickbait;
  const commentSentiment = doc.insights.comment_sentiment;

  return {
    ...toVideoCard(doc),
    description: doc.metadata.description,
    duration: doc.metadata.duration ?? "",
    transcript_status: doc.metadata.transcript_status,
    pillars: {
      packaging: clickbait.packaging.score,
      mismatch: {
        available: clickbait.mismatch.available,
        score: clickbait.mismatch.score,
      },
      betrayal: clickbait.betrayal.score,
    },
    betrayal_detail: {
      betrayal_rate: clickbait.betrayal.betrayal_rate,
      flagged_count: clickbait.betrayal.flagged_count,
      total_comments: clickbait.betrayal.total_comments,
    },
    thumbnail: doc.insights.thumbnail,
    comment_sentiment_overall: commentSentiment.overall,
    comment_sentiment_distribution: commentSentiment.distribution,
    timeline: doc.timeline.map(toTimelineDto),
    comments: doc.comments.slice(0, maxComments).map(toCommentDto),
  };
}
