import { app, InvocationContext } from "@azure/functions";
import { env } from "../../config/env";
import { updateChannelClickbait } from "../../services/channelService";
import {
  assembleClickbait,
  emptyBetrayal,
  emptyCommentSentiment,
  enrichVideoContent,
} from "../../services/enrichmentService";
import { fetchTranscript, TranscriptUnavailableError } from "../../services/transcriptService";
import { getVideoDetails, type VideoDetails } from "../../services/videoService";
import { videoInsightsRepository } from "../../db/repositories";
import {
  videoIngestionMessageSchema,
  type TranscriptSegment,
  type TranscriptStatus,
  type VideoIngestionMessage,
  type VideoInsights,
} from "../../types";

// Storage Queue trigger payloads are base64-decoded by the runtime; a JSON body
// arrives either already parsed (object) or as a string we parse here.
function decodeMessage(queueItem: unknown): unknown {
  if (typeof queueItem === "string") {
    try {
      return JSON.parse(queueItem);
    } catch {
      return queueItem;
    }
  }
  return queueItem;
}

/**
 * Video (content) stage. Triggered on the ingestion queue by the webhook/backfill.
 * Extracts metadata + transcript + thumbnail and scores the packaging + mismatch
 * pillars — NOT comments: a fresh upload has too few to be meaningful, so the
 * betrayal pillar + comment sentiment are deferred to the comment stage (fired
 * ~6h later by commentAnalysisScheduler). Comment data already on the document is
 * preserved and folded back into the merged score.
 */
export async function processVideoIngestion(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const parsed = videoIngestionMessageSchema.safeParse(decodeMessage(queueItem));
  if (!parsed.success) {
    context.warn("Skipping malformed ingestion message", queueItem);
    return;
  }

  const msg = parsed.data;
  await processMessage(msg, context);

  try {
    const rollup = await updateChannelClickbait(msg.channelId, context);
    if (rollup) {
      context.log(
        `Channel ${msg.channelId} propensity=${rollup.propensity_percentage}% ` +
          `(${rollup.likelihood}), flagged=${Math.round(rollup.flagged_pct * 100)}% of ` +
          `${rollup.video_count} videos, trend=${rollup.trend}`
      );
    }
  } catch (err) {
    context.warn(`Channel rollup update failed for ${msg.channelId}`, err);
  }
}

async function processMessage(
  msg: VideoIngestionMessage,
  context: InvocationContext
): Promise<void> {
  const { videoId, channelId } = msg;
  context.log(`Content stage: extracting video ${videoId} (channel ${channelId})`);

  // Metadata is the backbone; a transient API failure re-throws so the queue can
  // re-deliver. A missing video (deleted/private) is skipped cleanly.
  const details = await fetchMetadataOrThrow(videoId, context);
  if (!details) return;

  // Shorts are skipped — they don't have the promise/payoff structure the model
  // analyses. Threshold is configurable via MIN_VIDEO_SECONDS_THRESHOLD.
  const minSeconds = env().MIN_VIDEO_SECONDS_THRESHOLD;
  if (details.durationSeconds > 0 && details.durationSeconds < minSeconds) {
    context.log(`Skipping Short ${videoId} (${details.durationSeconds}s < ${minSeconds}s minimum)`);
    return;
  }

  const { transcript, transcriptStatus } = await fetchTranscriptSafe(videoId, context);

  const content = await enrichVideoContent(
    {
      title: details.title,
      description: details.description,
      thumbnailUrl: details.thumbnailUrl,
      transcript,
    },
    context
  );

  const existing = await videoInsightsRepository.read(videoId, channelId, context);
  const doc = buildDocument({ msg, details, transcript, transcriptStatus, content, existing });

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

interface FetchedTranscript {
  transcript: TranscriptSegment[];
  transcriptStatus: TranscriptStatus;
}

// Transcript failure never aborts the run — it just flags the status so the
// mismatch pillar degrades to unavailable.
async function fetchTranscriptSafe(
  videoId: string,
  context: InvocationContext
): Promise<FetchedTranscript> {
  try {
    return { transcript: await fetchTranscript(videoId), transcriptStatus: "success" };
  } catch (err) {
    if (err instanceof TranscriptUnavailableError) {
      context.log(`No transcript available for ${videoId}: ${err.message}`);
    } else {
      context.warn(`Transcript fetch failed for ${videoId} (continuing)`, err);
    }
    return { transcript: [], transcriptStatus: "failed_retryable" };
  }
}

interface BuildDocumentInput {
  msg: VideoIngestionMessage;
  details: VideoDetails;
  transcript: TranscriptSegment[];
  transcriptStatus: TranscriptStatus;
  content: Awaited<ReturnType<typeof enrichVideoContent>>;
  existing: VideoInsights | undefined;
}

// Merges with any existing doc so a re-run never discards prior comment analysis:
// betrayal + comment sentiment are carried over and folded back into the score.
function buildDocument(input: BuildDocumentInput): VideoInsights {
  const { msg, details, transcript, transcriptStatus, content, existing } = input;

  const betrayal = existing?.insights.clickbait.betrayal ?? emptyBetrayal();
  const commentSentiment = existing?.insights.comment_sentiment ?? emptyCommentSentiment();

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
    insights: {
      clickbait: assembleClickbait({
        packaging: content.packaging,
        mismatch: content.mismatch,
        betrayal,
      }),
      transcript_sentiment: content.transcript_sentiment,
      comment_sentiment: commentSentiment,
    },
    comments: existing?.comments ?? [],
    timeline: [
      ...(existing?.timeline ?? []),
      {
        timestamp: new Date().toISOString(),
        views: details.viewCount,
        likes: details.likeCount,
        comments: details.commentCount,
        aggregate_sentiment: commentSentiment.average_scores,
      },
    ],
    comments_processed_at: existing?.comments_processed_at,
  };
}

function logResult(context: InvocationContext, videoId: string, doc: VideoInsights): void {
  const cb = doc.insights.clickbait;
  const mismatch = cb.mismatch.available ? `${cb.mismatch.score} (${cb.mismatch.source})` : "n/a";
  const betrayal = cb.betrayal.available ? `${cb.betrayal.score}` : "pending";
  context.log(
    `Persisted ${videoId} (content stage): ` +
      `transcript=${doc.metadata.transcript_status} (${doc.metadata.transcript.length} segments), ` +
      `clickbait=${cb.clickbait_percentage}% (${cb.likelihood}) ` +
      `[pkg=${cb.packaging.score}/${cb.packaging.llm_source}, mismatch=${mismatch}, betrayal=${betrayal}], ` +
      `transcript_sentiment=${doc.insights.transcript_sentiment.label}`
  );
}

app.storageQueue("processVideoIngestion", {
  queueName: "%INGESTION_QUEUE_NAME%",
  connection: "AzureWebJobsStorage",
  handler: processVideoIngestion,
});
