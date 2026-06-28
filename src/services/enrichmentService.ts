import { scoreClickbait } from "./clickbaitService";
import { analyzeSentiments, analyzeSingleSentiment } from "./sentimentService";
import { analyzeThumbnail } from "./visionService";
import type {
  ClickbaitSignals,
  CommentRecord,
  CommentSentimentInsights,
  Logger,
  Sentiment,
  SentimentScores,
  TranscriptSegment,
  VideoInsightsBlock,
} from "../types";

const HOOK_WINDOW_SECONDS = 15;

export interface EnrichmentInput {
  title: string;
  description: string;
  thumbnailUrl: string;
  transcript: TranscriptSegment[];
  comments: CommentRecord[];
}

export interface EnrichmentResult {
  insights: VideoInsightsBlock;
  comments: CommentRecord[];
}

interface ThumbnailEvidence {
  ocrLines: string[];
  tags: string[];
  objects: string[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Orchestrates every AI step and assembles the insights block. Each step
 * degrades independently: a Vision/Gemini/Language failure never blocks the
 * others or final persistence.
 */
export async function enrichVideo(
  input: EnrichmentInput,
  logger: Logger
): Promise<EnrichmentResult> {
  const thumbnail = await analyzeThumbnailEvidence(input.thumbnailUrl, logger);

  const signals: ClickbaitSignals = {
    title: input.title,
    description: input.description,
    tags: thumbnail.tags,
    objects: thumbnail.objects,
    thumbnailText: thumbnail.ocrLines,
  };
  const clickbait = await scoreClickbait(signals, logger);

  const transcriptLabel = await scoreTranscriptHook(input.transcript, logger);
  const comments = await scoreCommentSentiment(input.comments, logger);

  return {
    insights: {
      thumbnail: { ocr_text: thumbnail.ocrLines, tags: thumbnail.tags, objects: thumbnail.objects },
      clickbait,
      transcript_sentiment: { label: transcriptLabel, window_seconds: HOOK_WINDOW_SECONDS },
      comment_sentiment: summarizeComments(comments),
    },
    comments,
  };
}

/** Vision OCR + tags + objects; degrades to empty evidence on failure. */
async function analyzeThumbnailEvidence(
  thumbnailUrl: string,
  logger: Logger
): Promise<ThumbnailEvidence> {
  try {
    const vision = await analyzeThumbnail(thumbnailUrl);
    return { ocrLines: vision.ocrLines, tags: vision.tags, objects: vision.objects };
  } catch (err) {
    logger.warn("Vision analysis failed (degrading to no OCR/tags/objects)", err);
    return { ocrLines: [], tags: [], objects: [] };
  }
}

/** Sentiment of the transcript's first HOOK_WINDOW_SECONDS; Neutral on failure. */
async function scoreTranscriptHook(
  transcript: TranscriptSegment[],
  logger: Logger
): Promise<Sentiment> {
  const hook = transcript
    .filter((s) => s.start < HOOK_WINDOW_SECONDS)
    .map((s) => s.text)
    .join(" ")
    .trim();
  if (!hook) return "Neutral";

  try {
    return (await analyzeSingleSentiment(hook)).sentiment;
  } catch (err) {
    logger.warn("Transcript sentiment failed (degrading to Neutral)", err);
    return "Neutral";
  }
}

/** Per-comment sentiment + confidence; leaves existing values on failure. */
async function scoreCommentSentiment(
  comments: CommentRecord[],
  logger: Logger
): Promise<CommentRecord[]> {
  try {
    const results = await analyzeSentiments(comments.map((c) => c.text));
    return comments.map((c, i) => ({
      ...c,
      sentiment: results[i].sentiment,
      confidence: results[i].confidence,
    }));
  } catch (err) {
    logger.warn("Comment sentiment failed (leaving existing values)", err);
    return comments;
  }
}

/**
 * Aggregates per-comment sentiment into label counts, distribution, and the
 * mean of confidence scores. The overall label is the argmax of those means.
 */
function summarizeComments(comments: CommentRecord[]): CommentSentimentInsights {
  const total = comments.length;
  const counts = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  const sum: SentimentScores = { positive: 0, neutral: 0, negative: 0 };

  for (const c of comments) {
    if (c.sentiment === "Positive") counts.positive++;
    else if (c.sentiment === "Negative") counts.negative++;
    else if (c.sentiment === "Mixed") counts.mixed++;
    else counts.neutral++;

    if (c.confidence) {
      sum.positive += c.confidence.positive;
      sum.neutral += c.confidence.neutral;
      sum.negative += c.confidence.negative;
    }
  }

  const denom = total || 1;
  const average_scores: SentimentScores = {
    positive: round2(sum.positive / denom),
    neutral: round2(sum.neutral / denom),
    negative: round2(sum.negative / denom),
  };

  let overall: Sentiment = "Neutral";
  const { positive, neutral, negative } = average_scores;
  if (total > 0) {
    if (positive >= neutral && positive >= negative) overall = "Positive";
    else if (negative >= neutral && negative >= positive) overall = "Negative";
    else overall = "Neutral";
  }

  const dist = (n: number) => round2(n / denom);
  return {
    overall,
    counts,
    distribution: {
      positive: dist(counts.positive),
      negative: dist(counts.negative),
      neutral: dist(counts.neutral),
      mixed: dist(counts.mixed),
    },
    average_scores,
    total,
  };
}
