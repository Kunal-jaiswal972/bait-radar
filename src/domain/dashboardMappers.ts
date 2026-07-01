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
// (heuristic/llm packaging sub-scores, effective weights) are deliberately
// dropped here; only the final merged scores reach the client.

/** Most recent engagement snapshot (undefined when none recorded yet). */
function latestPoint(timeline: TimelinePoint[]): TimelinePoint | undefined {
  return timeline?.[timeline.length - 1];
}

/** Canonical YouTube link: prefer the @handle, fall back to the /channel/ id URL. */
function channelUrlFor(channel: Channel): string {
  if (channel.customUrl) {
    const handle = channel.customUrl.startsWith("@") ? channel.customUrl : `@${channel.customUrl}`;
    return `https://www.youtube.com/${handle}`;
  }
  return `https://www.youtube.com/channel/${channel.channelId}`;
}

export function toChannelSummary(channel: Channel): ChannelSummary {
  return {
    channelId: channel.channelId,
    title: channel.title ?? channel.channelId,
    handle: channel.customUrl,
    description: channel.description,
    thumbnailUrl: channel.thumbnailUrl,
    channelUrl: channelUrlFor(channel),
    subscriberCount: channel.subscriberCount,
    videoCount: channel.videoCount,
    hubSubscriptionStatus: channel.hubSubscriptionStatus,
    clickbait: channel.clickbait,
    createdAt: channel.createdAt,
  };
}

export function toVideoCard(doc: VideoInsights): VideoCard {
  const clickbait = doc.insights.clickbait;
  const last = latestPoint(doc.timeline);
  return {
    videoId: doc.id,
    channelId: doc.channelId,
    channelTitle: doc.metadata.channelTitle ?? "",
    title: doc.metadata.title,
    thumbnailUrl: doc.metadata.thumbnailUrl,
    videoUrl: doc.metadata.videoUrl,
    publishedAt: doc.publishedAt,
    duration: doc.metadata.duration ?? "",
    views: last?.views ?? 0,
    likes: last?.likes ?? 0,
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
    publishedAt: comment.timestamp,
  };
}

export function toVideoDetail(doc: VideoInsights): VideoDetail {
  const clickbait = doc.insights.clickbait;
  const commentSentiment = doc.insights.comment_sentiment;

  return {
    ...toVideoCard(doc),
    description: doc.metadata.description,
    transcript_status: doc.metadata.transcript_status,
    transcript: doc.metadata.transcript.map((s) => ({ start: s.start, text: s.text })),
    insights: {
      pillars: {
        packaging: clickbait.packaging.score,
        mismatch: {
          available: clickbait.mismatch.available,
          score: clickbait.mismatch.score,
        },
        betrayal: clickbait.betrayal.score,
      },
      betrayal: {
        betrayal_rate: clickbait.betrayal.betrayal_rate,
        flagged_count: clickbait.betrayal.flagged_count,
        total_comments: clickbait.betrayal.total_comments,
      },
      comment: {
        overall: commentSentiment.overall,
        distribution: commentSentiment.distribution,
      },
      transcript: { sentiment: doc.insights.transcript_sentiment.label },
      thumbnail: doc.insights.thumbnail,
    },
    timeline: doc.timeline.map(toTimelineDto),
    // All stored comments (≤200); the dashboard sorts/filters/paginates client-side.
    comments: doc.comments.map(toCommentDto),
  };
}
