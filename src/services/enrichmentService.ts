import { scorePackaging } from "./clickbaitService";
import { scoreMismatch } from "./mismatchService";
import { analyzeSentiments, analyzeSingleSentiment } from "./sentimentService";
import { aggregateClickbait, betrayalFromComments, likelihoodLabel } from "../domain/clickbait";
import type {
  ClickbaitInsights,
  ClickbaitSignals,
  CommentRecord,
  CommentSentimentInsights,
  Logger,
  Sentiment,
  SentimentScores,
  TranscriptSegment,
} from "../types";

// The pipeline runs in two independent stages (each persists on its own):
//   1. content stage — packaging, mismatch, transcript sentiment (runs on
//      upload; needs no comments). The multimodal Gemini scorer reads the
//      thumbnail image directly, so no separate Vision pass is needed.
//   2. comment stage — per-comment sentiment, comment-sentiment summary, and the
//      betrayal pillar (runs ~6h later, once enough comments exist).
// assembleClickbait() blends whichever pillars are available into the final index.

export interface VideoContentInput {
  title: string;
  description: string;
  thumbnailUrl: string;
  transcript: TranscriptSegment[];
}

export interface VideoContentResult {
  packaging: ClickbaitInsights["packaging"];
  mismatch: ClickbaitInsights["mismatch"];
  transcript_sentiment: { label: Sentiment };
}

export interface CommentEnrichmentResult {
  scoredComments: CommentRecord[];
  comment_sentiment: CommentSentimentInsights;
  betrayal: ClickbaitInsights["betrayal"];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Content stage — packaging, mismatch, and transcript sentiment from the
 * title/description/thumbnail/transcript. Needs no comments, so it runs on
 * upload. Each AI step degrades independently on failure.
 */
export async function enrichVideoContent(
  input: VideoContentInput,
  logger: Logger
): Promise<VideoContentResult> {
  const signals: ClickbaitSignals = {
    title: input.title,
    description: input.description,
    thumbnailUrl: input.thumbnailUrl,
  };

  const [packaging, mismatch, transcriptLabel] = await Promise.all([
    scorePackaging(signals, logger),
    scoreMismatch({ title: input.title, transcript: input.transcript }, logger),
    scoreTranscriptSentiment(input.transcript, logger),
  ]);

  return {
    packaging,
    mismatch,
    transcript_sentiment: { label: transcriptLabel },
  };
}

/**
 * Comment stage — per-comment sentiment, the comment-sentiment summary, and the
 * betrayal pillar. Runs once enough comments exist (~6h after upload) or on a
 * manual refresh. Betrayal is `available` only when at least one comment was read.
 */
export async function enrichComments(
  comments: CommentRecord[],
  logger: Logger
): Promise<CommentEnrichmentResult> {
  const scoredComments = await scoreCommentSentiment(comments, logger);
  const b = betrayalFromComments(scoredComments);

  return {
    scoredComments,
    comment_sentiment: summarizeComments(scoredComments),
    betrayal: {
      available: b.total_comments > 0,
      score: b.score,
      betrayal_rate: b.betrayal_rate,
      flagged_count: b.flagged_count,
      total_comments: b.total_comments,
    },
  };
}

/**
 * Blends the three pillars into the weighted clickbait index + likelihood label.
 * mismatch (no transcript) and betrayal (comment pass not yet run) each drop out
 * and get renormalized away when unavailable.
 */
export function assembleClickbait(input: {
  packaging: ClickbaitInsights["packaging"];
  mismatch: ClickbaitInsights["mismatch"];
  betrayal: ClickbaitInsights["betrayal"];
}): ClickbaitInsights {
  const { packaging, mismatch, betrayal } = input;
  const agg = aggregateClickbait({
    packaging: packaging.score,
    mismatch: mismatch.available ? mismatch.score : null,
    betrayal: betrayal.available ? betrayal.score : null,
  });

  return {
    packaging,
    mismatch,
    betrayal,
    clickbait_percentage: agg.percentage,
    likelihood: likelihoodLabel(agg.percentage),
    weights: agg.weights,
  };
}

/** Betrayal pillar before the comment pass has run (weight renormalized out). */
export function emptyBetrayal(): ClickbaitInsights["betrayal"] {
  return { available: false, score: 0, betrayal_rate: 0, flagged_count: 0, total_comments: 0 };
}

/** Comment-sentiment summary before any comments have been analyzed. */
export function emptyCommentSentiment(): CommentSentimentInsights {
  return {
    overall: "Neutral",
    counts: { positive: 0, negative: 0, neutral: 0, mixed: 0 },
    distribution: { positive: 0, negative: 0, neutral: 0, mixed: 0 },
    average_scores: { positive: 0, neutral: 0, negative: 0 },
    total: 0,
  };
}

/**
 * Overall sentiment of the whole transcript; Neutral on failure. The text is
 * capped to the Azure Language per-document limit (~5000 chars) by
 * analyzeSingleSentiment.
 */
async function scoreTranscriptSentiment(
  transcript: TranscriptSegment[],
  logger: Logger
): Promise<Sentiment> {
  const full = transcript
    .map((s) => s.text)
    .join(" ")
    .trim();
  if (!full) return "Neutral";

  try {
    return (await analyzeSingleSentiment(full)).sentiment;
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
      opinions: results[i].opinions,
    }));
  } catch (err) {
    logger.warn("Comment sentiment failed (leaving existing values)", err);
    return comments;
  }
}

/**
 * Aggregates per-comment sentiment into label counts, distribution, and the mean
 * of confidence scores. The overall label is the argmax of those means.
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
