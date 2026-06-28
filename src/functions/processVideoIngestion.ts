import { app, InvocationContext } from "@azure/functions";
import { enrichVideo, type EnrichmentResult } from "../services/enrichmentService";
import { fetchTranscript, TranscriptUnavailableError } from "../services/transcriptService";
import { getTopComments, getVideoDetails, type RawComment, type VideoDetails } from "../services/videoService";
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

  for (const raw of batch) {
    const parsed = videoIngestionMessageSchema.safeParse(raw);
    if (!parsed.success) {
      context.warn("Skipping malformed ingestion message", raw);
      continue;
    }
    await processMessage(parsed.data, context);
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
    comments = await getTopComments(videoId, 100);
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
}

function logResult(context: InvocationContext, videoId: string, doc: VideoInsights): void {
  const ins = doc.insights;
  context.log(
    `Persisted ${videoId}: ${doc.comments.length} comments, ` +
      `transcript=${doc.metadata.transcript_status} (${doc.metadata.transcript.length} segments), ` +
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
