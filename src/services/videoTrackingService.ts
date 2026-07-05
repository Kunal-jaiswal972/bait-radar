import { updateChannelClickbait } from "./channelService";
import { assembleClickbait, enrichComments } from "./enrichmentService";
import {
  getRecentComments,
  getVideoDetails,
  type RawComment,
  type VideoDetails,
} from "./videoService";
import { videoInsightsRepository } from "../db/repositories";
import type { CommentRecord, Logger, TimelinePoint, VideoInsights } from "../types";

// Post-upload tracking workflows that run on the existing document rather than
// creating it:
//   • processCommentsForVideo — the comment stage (top-100 comments, sentiment,
//     betrayal, rescore) fired ~6h after upload or on a manual refresh.
//   • appendVideoStats — a cheap views/likes snapshot for the engagement chart.

// Top comments fetched per pass — enough to represent the audience verdict
// without paginating deep into stale, low-signal replies.
const COMMENTS_PER_PASS = 100;

interface VideoRef {
  videoId: string;
  channelId: string; // partition key
}

// RawComment -> CommentRecord with placeholder sentiment (enrichComments fills it).
function toCommentRecords(raw: RawComment[]): CommentRecord[] {
  return raw.map((c) => ({
    id: c.id,
    author: c.author,
    text: c.text,
    sentiment: "Neutral",
    opinions: [],
    timestamp: c.timestamp,
  }));
}

// A timeline snapshot from the freshest stats we have, falling back to the last
// recorded point when the video's stats can't be refetched.
function buildTimelinePoint(doc: VideoInsights, details: VideoDetails | null): TimelinePoint {
  const last = doc.timeline[doc.timeline.length - 1];
  return {
    timestamp: new Date().toISOString(),
    views: details?.viewCount ?? last?.views ?? 0,
    likes: details?.likeCount ?? last?.likes ?? 0,
    comments: details?.commentCount ?? last?.comments ?? 0,
    aggregate_sentiment: doc.insights.comment_sentiment.average_scores,
  };
}

/**
 * Comment stage: fetch the top-100 comments by relevance, score sentiment +
 * betrayal, fold the betrayal pillar back into the merged clickbait index, append
 * a fresh stats point, and stamp comments_processed_at. Also refreshes the channel
 * rollup (betrayal_rate feeds it). Returns false when the video isn't tracked.
 */
export async function processCommentsForVideo(ref: VideoRef, logger: Logger): Promise<boolean> {
  const { videoId, channelId } = ref;
  const existing = await videoInsightsRepository.read(videoId, channelId, logger);
  if (!existing) {
    logger.warn(`Comment stage: video ${videoId} not found; skipping`);
    return false;
  }

  const raw = await getRecentComments(videoId, { max: COMMENTS_PER_PASS, order: "relevance" });
  const { scoredComments, comment_sentiment, betrayal } = await enrichComments(
    toCommentRecords(raw),
    logger
  );

  // Refresh stats for the timeline point too (best-effort; deleted video → null).
  const details = await getVideoDetails(videoId).catch(() => null);

  const clickbait = assembleClickbait({
    packaging: existing.insights.clickbait.packaging,
    mismatch: existing.insights.clickbait.mismatch,
    betrayal,
  });

  const doc: VideoInsights = {
    ...existing,
    insights: { ...existing.insights, clickbait, comment_sentiment },
    comments: scoredComments,
    timeline: [
      ...existing.timeline,
      buildTimelinePoint(
        { ...existing, insights: { ...existing.insights, comment_sentiment } },
        details
      ),
    ],
    comments_processed_at: new Date().toISOString(),
  };

  await videoInsightsRepository.upsert(doc);
  logger.log(
    `Comment stage ${videoId}: ${scoredComments.length} comments, ` +
      `betrayal=${betrayal.available ? betrayal.score : "n/a"}, ` +
      `clickbait=${clickbait.clickbait_percentage}% (${clickbait.likelihood})`
  );

  await updateChannelClickbait(channelId, logger);
  return true;
}

/**
 * Stats-only snapshot: append a views/likes/comments point for the engagement
 * chart without any AI. Returns false when the video is untracked or gone.
 */
export async function appendVideoStats(ref: VideoRef, logger: Logger): Promise<boolean> {
  const { videoId, channelId } = ref;
  const existing = await videoInsightsRepository.read(videoId, channelId, logger);
  if (!existing) return false;

  const details = await getVideoDetails(videoId);
  if (!details) {
    logger.warn(`Stats snapshot: video ${videoId} not found (deleted/private); skipping`);
    return false;
  }

  const doc: VideoInsights = {
    ...existing,
    timeline: [...existing.timeline, buildTimelinePoint(existing, details)],
  };

  await videoInsightsRepository.upsert(doc);
  logger.log(`Stats snapshot ${videoId}: views=${details.viewCount} likes=${details.likeCount}`);
  return true;
}
