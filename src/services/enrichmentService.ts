// Orchestrates all AI enrichment and builds the insights block. Every step
// degrades independently — a Vision/Gemini/Language failure never blocks the
// others or final persistence.

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
  comments: CommentRecord[]; // sentiment + confidence populated where available
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Text of the transcript's first HOOK_WINDOW_SECONDS seconds.
function hookText(transcript: TranscriptSegment[]): string {
  return transcript
    .filter((s) => s.start < HOOK_WINDOW_SECONDS)
    .map((s) => s.text)
    .join(" ")
    .trim();
}

// Overall comment-sentiment summary: label counts, distribution, and the mean
// of per-comment confidence scores (overall label = argmax of those means).
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

export async function enrichVideo(
  input: EnrichmentInput,
  logger: Logger
): Promise<EnrichmentResult> {
  // Vision: OCR + tags + objects.
  let ocrLines: string[] = [];
  let tags: string[] = [];
  let objects: string[] = [];
  try {
    const vision = await analyzeThumbnail(input.thumbnailUrl);
    ocrLines = vision.ocrLines;
    tags = vision.tags;
    objects = vision.objects;
  } catch (err) {
    logger.warn("Vision analysis failed (degrading to no OCR/tags/objects)", err);
  }

  // Both clickbait scorers evaluate the same evidence.
  const signals: ClickbaitSignals = {
    title: input.title,
    description: input.description,
    tags,
    objects,
    thumbnailText: ocrLines,
  };
  const clickbait = await scoreClickbait(signals, logger);

  // Transcript (hook) sentiment.
  let transcriptLabel: Sentiment = "Neutral";
  const hook = hookText(input.transcript);
  if (hook) {
    try {
      transcriptLabel = (await analyzeSingleSentiment(hook)).sentiment;
    } catch (err) {
      logger.warn("Transcript sentiment failed (degrading to Neutral)", err);
    }
  }

  // Per-comment sentiment + confidence scores.
  let comments = input.comments;
  try {
    const results = await analyzeSentiments(comments.map((c) => c.text));
    comments = comments.map((c, i) => ({
      ...c,
      sentiment: results[i].sentiment,
      confidence: results[i].confidence,
    }));
  } catch (err) {
    logger.warn("Comment sentiment failed (leaving existing values)", err);
  }

  return {
    insights: {
      thumbnail: { ocr_text: ocrLines, tags, objects },
      clickbait,
      transcript_sentiment: { label: transcriptLabel, window_seconds: HOOK_WINDOW_SECONDS },
      comment_sentiment: summarizeComments(comments),
    },
    comments,
  };
}
