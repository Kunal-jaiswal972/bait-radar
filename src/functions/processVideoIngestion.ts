// EventHubTrigger on video-ingestion-hub. Extracts metadata, comments, and the
// transcript, runs AI enrichment, and upserts the VideoInsights document.
//
// Resilience rule: never discard successfully fetched data on partial failure.
// Each source is fetched independently; a transcript/comment failure flags
// transcript_status = failed_retryable but still persists everything else.

import { app, InvocationContext } from "@azure/functions";
import { enrichVideo } from "../services/enrichmentService";
import { fetchTranscript, TranscriptUnavailableError } from "../services/transcriptService";
import { getTopComments, getVideoDetails, type RawComment } from "../services/videoService";
import { videoInsightsRepository } from "../db/repositories";
import {
  videoIngestionMessageSchema,
  type CommentRecord,
  type TranscriptSegment,
  type TranscriptStatus,
  type VideoIngestionMessage,
  type VideoInsights,
} from "../types";

// RawComment -> CommentRecord with placeholder sentiment (enrichment fills it).
function toCommentRecords(raw: RawComment[]): CommentRecord[] {
  return raw.map((c) => ({
    id: c.id,
    author: c.author,
    text: c.text,
    sentiment: "Neutral",
    timestamp: c.timestamp,
  }));
}

export async function processVideoIngestion(
  messages: unknown[],
  context: InvocationContext
): Promise<void> {
  const batch = Array.isArray(messages) ? messages : [messages];
  context.log(`Extraction worker received ${batch.length} message(s)`);

  for (const raw of batch) {
    const parsed = videoIngestionMessageSchema.safeParse(raw);
    if (!parsed.success) {
      context.warn("Skipping malformed ingestion message", raw);
      continue;
    }
    await processMessage(parsed.data, context);
  }
}

async function processMessage(
  msg: VideoIngestionMessage,
  context: InvocationContext
): Promise<void> {
  const { videoId, channelId } = msg;
  context.log(`Extracting video ${videoId} (channel ${channelId})`);

  // Metadata is the backbone; a transient API failure re-throws so the Event
  // Hub can re-deliver.
  let details;
  try {
    details = await getVideoDetails(videoId);
  } catch (err) {
    context.error(`Metadata fetch failed for ${videoId}`, err);
    throw err;
  }
  if (!details) {
    context.warn(`Video ${videoId} not found (deleted/private); skipping`);
    return;
  }

  // Comments (independent).
  let comments: CommentRecord[] = [];
  let commentsFailed = false;
  try {
    comments = toCommentRecords(await getTopComments(videoId, 100));
  } catch (err) {
    commentsFailed = true;
    context.warn(`Comment fetch failed for ${videoId} (continuing)`, err);
  }

  // Transcript (independent).
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

  // AI enrichment (never throws; each step degrades independently).
  const enrichment = await enrichVideo(
    {
      title: details.title,
      description: details.description,
      thumbnailUrl: details.thumbnailUrl,
      transcript,
      comments,
    },
    { log: (m) => context.log(m), warn: (m, e) => context.warn(m, e) }
  );

  // Merge with any existing doc so re-runs never discard prior data.
  const existing = await videoInsightsRepository.read(videoId, channelId, {
    log: (m) => context.log(m),
    warn: (m, e) => context.warn(m, e),
  });
  const doc: VideoInsights = {
    id: videoId,
    channelId,
    publishedAt: details.publishedAt ?? msg.publishedAt ?? new Date().toISOString(),
    metadata: {
      title: details.title,
      description: details.description,
      thumbnailUrl: details.thumbnailUrl,
      videoUrl: details.videoUrl,
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
        aggregate_sentiment: enrichment.insights.comment_sentiment.average_scores,
      },
    ],
  };

  await videoInsightsRepository.upsert(doc);
  const ins = doc.insights;
  context.log(
    `Persisted ${videoId}: ${doc.comments.length} comments, ` +
      `transcript=${transcriptStatus} (${doc.metadata.transcript.length} segments), ` +
      `clickbait=${ins.clickbait.verdict} (weighted=${ins.clickbait.weighted_score}, ${ins.clickbait.llm_source}), ` +
      `transcript_sentiment=${ins.transcript_sentiment.label}, ` +
      `comments_overall=${ins.comment_sentiment.overall}`
  );
}

app.eventHub("processVideoIngestion", {
  connection: "EventHubConnection",
  eventHubName: "video-ingestion-hub",
  cardinality: "many",
  handler: processVideoIngestion,
});
