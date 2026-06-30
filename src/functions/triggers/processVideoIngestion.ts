import { app, InvocationContext } from "@azure/functions";
import { env } from "../../config/env";
import { updateChannelClickbait } from "../../services/channelService";
import { enrichVideo, type EnrichmentResult } from "../../services/enrichmentService";
import { fetchTranscript, TranscriptUnavailableError } from "../../services/transcriptService";
import { getRecentComments, getVideoDetails, type RawComment, type VideoDetails } from "../../services/videoService";
import { videoInsightsRepository } from "../../db/repositories";
import {
  videoIngestionMessageSchema,
  type CommentRecord,
  type TranscriptSegment,
  type TranscriptStatus,
  type VideoIngestionMessage,
  type VideoInsights,
} from "../../types";

// RawComment -> CommentRecord with placeholder sentiment (enrichment fills it).
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

/**
 * EventHubTrigger on video-ingestion-hub: validates each message and processes
 * it independently so one bad payload can't poison the batch.
 */
export async function processVideoIngestion(
  messages: unknown[],
  context: InvocationContext
): Promise<void> {
  const batch = Array.isArray(messages) ? messages : [messages];
  context.log(`Extraction worker received ${batch.length} message(s)`);

  const channelIds = new Set<string>();
  for (const raw of batch) {
    const parsed = videoIngestionMessageSchema.safeParse(raw);
    if (!parsed.success) {
      context.warn("Skipping malformed ingestion message", raw);
      continue;
    }
    channelIds.add(parsed.data.channelId);
    await processMessage(parsed.data, context);
  }

  // Refresh each touched channel's clickbait propensity once per batch.
  for (const channelId of channelIds) {
    try {
      const rollup = await updateChannelClickbait(channelId, context);
      if (rollup) {
        context.log(
          `Channel ${channelId} propensity=${rollup.propensity_percentage}% ` +
            `(${rollup.likelihood}), flagged=${Math.round(rollup.flagged_pct * 100)}% of ` +
            `${rollup.video_count} videos, trend=${rollup.trend}`
        );
      }
    } catch (err) {
      context.warn(`Channel rollup update failed for ${channelId}`, err);
    }
  }
}

/**
 * Extracts metadata, comments, and transcript, runs AI enrichment, then upserts
 * the VideoInsights document. Resilience rule: never discard successfully
 * fetched data on partial failure — each source is fetched independently.
 */
async function processMessage(
  msg: VideoIngestionMessage,
  context: InvocationContext
): Promise<void> {
  const { videoId, channelId } = msg;
  context.log(`Extracting video ${videoId} (channel ${channelId})`);

  // Metadata is the backbone; a transient API failure re-throws so the Event
  // Hub can re-deliver. A missing video (deleted/private) is skipped cleanly.
  const details = await fetchMetadataOrThrow(videoId, context);
  if (!details) return;

  // Shorts are skipped entirely — they don't have the promise/payoff structure
  // the clickbait model analyses. Threshold is configurable via MIN_VIDEO_SECONDS_THRESHOLD.
  const minSeconds = env().MIN_VIDEO_SECONDS_THRESHOLD;
  if (details.durationSeconds > 0 && details.durationSeconds < minSeconds) {
    context.log(`Skipping Short ${videoId} (${details.durationSeconds}s < ${minSeconds}s minimum)`);
    return;
  }

  const { comments, transcript, transcriptStatus } = await extractContent(videoId, context);

  const enrichment = await enrichVideo(
    {
      title: details.title,
      description: details.description,
      thumbnailUrl: details.thumbnailUrl,
      transcript,
      comments: toCommentRecords(comments),
    },
    context
  );

  const existing = await videoInsightsRepository.read(videoId, channelId, context);
  const doc = buildDocument(msg, details, transcript, transcriptStatus, enrichment, existing);

  await videoInsightsRepository.upsert(doc);
  logResult(context, videoId, doc);
}

async function fetchMetadataOrThrow(
  videoId: string,
  context: InvocationContext
): Promise<VideoDetails | null> {
  try {
    const details = await getVideoDetails(videoId);
    if (!details) context.warn(`Video ${videoId} not found (deleted/private); skipping`);
    return details;
  } catch (err) {
    context.error(`Metadata fetch failed for ${videoId}`, err);
    throw err;
  }
}

interface ExtractedContent {
  comments: RawComment[];
  transcript: TranscriptSegment[];
  transcriptStatus: TranscriptStatus;
}

// Comments and transcript are fetched independently; either failing flags
// transcript_status = failed_retryable but never aborts the run.
async function extractContent(
  videoId: string,
  context: InvocationContext
): Promise<ExtractedContent> {
  let comments: RawComment[] = [];
  let commentsFailed = false;
  try {
    comments = await getRecentComments(videoId, 200);
  } catch (err) {
    commentsFailed = true;
    context.warn(`Comment fetch failed for ${videoId} (continuing)`, err);
  }

  let transcript: TranscriptSegment[] = [];
  let transcriptStatus: TranscriptStatus = "success";
  try {
    transcript = await fetchTranscript(videoId);
  } catch (err) {
    if (err instanceof TranscriptUnavailableError) {
      context.log(`No transcript available for ${videoId}: ${err.message}`);
    } else {
      context.warn(`Transcript fetch failed for ${videoId} (continuing)`, err);
    }
    transcriptStatus = "failed_retryable";
  }
  if (commentsFailed && transcriptStatus === "success") {
    transcriptStatus = "failed_retryable";
  }

  return { comments, transcript, transcriptStatus };
}

// Merges with any existing doc so re-runs never discard prior data.
function buildDocument(
  msg: VideoIngestionMessage,
  details: VideoDetails,
  transcript: TranscriptSegment[],
  transcriptStatus: TranscriptStatus,
  enrichment: EnrichmentResult,
  existing: VideoInsights | undefined
): VideoInsights {
  return {
    id: msg.videoId,
    channelId: msg.channelId,
    publishedAt: details.publishedAt ?? msg.publishedAt ?? new Date().toISOString(),
    metadata: {
      title: details.title,
      description: details.description,
      channelTitle: details.channelTitle,
      thumbnailUrl: details.thumbnailUrl,
      videoUrl: details.videoUrl,
      duration: details.duration,
      transcript_status: transcriptStatus,
      transcript: transcript.length ? transcript : existing?.metadata.transcript ?? [],
    },
    insights: enrichment.insights,
    comments: enrichment.comments.length ? enrichment.comments : existing?.comments ?? [],
    timeline: [
      ...(existing?.timeline ?? []),
      {
        timestamp: new Date().toISOString(),
        views: details.viewCount,
        likes: details.likeCount,
        comments: details.commentCount,
        aggregate_sentiment: enrichment.insights.comment_sentiment.average_scores,
      },
    ],
  };
}

function logResult(context: InvocationContext, videoId: string, doc: VideoInsights): void {
  const cb = doc.insights.clickbait;
  const mismatch = cb.mismatch.available ? `${cb.mismatch.score} (${cb.mismatch.source})` : "n/a";
  context.log(
    `Persisted ${videoId}: ${doc.comments.length} comments, ` +
      `transcript=${doc.metadata.transcript_status} (${doc.metadata.transcript.length} segments), ` +
      `clickbait=${cb.clickbait_percentage}% (${cb.likelihood}) ` +
      `[pkg=${cb.packaging.score}/${cb.packaging.llm_source}, mismatch=${mismatch}, betrayal=${cb.betrayal.score}], ` +
      `transcript_sentiment=${doc.insights.transcript_sentiment.label}, ` +
      `comments_overall=${doc.insights.comment_sentiment.overall}`
  );
}

app.eventHub("processVideoIngestion", {
  connection: "EventHubConnection",
  eventHubName: "video-ingestion-hub",
  cardinality: "many",
  handler: processVideoIngestion,
});
