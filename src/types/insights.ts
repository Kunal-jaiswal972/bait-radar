import { z } from "zod";
import { likelihoodSchema, sentimentSchema, sentimentScoresSchema } from "./common";

/** Evidence fed to the packaging scorers (heuristic + LLM). Internal-only, never persisted. */
export interface ClickbaitSignals {
  title: string;
  description: string;
  thumbnailUrl: string; // sent to Gemini as a multimodal image part — the LLM reads the thumbnail directly
}

// Pillar 1 — packaging bait: title + description + thumbnail (heuristic + Gemini).
export const packagingPillarSchema = z.object({
  heuristic_score: z.number(),
  llm_score: z.number(),
  llm_source: z.string(), // model name, or "heuristic_fallback"
  score: z.number(), // merged: 0.3*heuristic + 0.7*llm
});
export type PackagingPillar = z.infer<typeof packagingPillarSchema>;

// Pillar 2 — promise–payoff mismatch: does the content deliver the title's promise?
export const mismatchPillarSchema = z.object({
  available: z.boolean(), // false when there is no transcript
  score: z.number(), // 0..1, higher = bigger gap
  source: z.string(), // "gemini" | "lexical_fallback" | "unavailable"
});
export type MismatchPillar = z.infer<typeof mismatchPillarSchema>;

// Pillar 3 — audience betrayal: comments calling out clickbait. `available` is
// false until the comment pass runs (~6h after upload); before that its weight is
// renormalized out of the merged index (the same way mismatch is when absent).
export const betrayalPillarSchema = z
  .object({
    // Optional on input for backward compatibility: documents written before the
    // comment-decoupling migration have no `available`. Defaulted on read from
    // total_comments so those docs parse cleanly and render correctly.
    available: z.boolean().optional(),
    score: z.number(), // 0..1 (betrayal_rate scaled)
    betrayal_rate: z.number(), // fraction of comments flagged
    flagged_count: z.number(),
    total_comments: z.number(),
  })
  .transform((b) => ({ ...b, available: b.available ?? b.total_comments > 0 }));
export type BetrayalPillar = z.infer<typeof betrayalPillarSchema>;

// The merged clickbait index: pillars + weighted aggregate + likelihood label.
export const clickbaitInsightsSchema = z.object({
  packaging: packagingPillarSchema,
  mismatch: mismatchPillarSchema,
  betrayal: betrayalPillarSchema,
  clickbait_percentage: z.number(), // 0..100, rough estimate
  likelihood: likelihoodSchema,
  weights: z.object({
    packaging: z.number(),
    mismatch: z.number(),
    betrayal: z.number(),
  }), // effective weights (renormalized when mismatch is unavailable)
});
export type ClickbaitInsights = z.infer<typeof clickbaitInsightsSchema>;

/** Overall sentiment of the video's transcript. */
export const transcriptSentimentInsightsSchema = z.object({
  label: sentimentSchema,
});
export type TranscriptSentimentInsights = z.infer<typeof transcriptSentimentInsightsSchema>;

const sentimentBucketsSchema = z.object({
  positive: z.number(),
  negative: z.number(),
  neutral: z.number(),
  mixed: z.number(),
});

/** Overall sentiment aggregated across all comments. */
export const commentSentimentInsightsSchema = z.object({
  overall: sentimentSchema,
  counts: sentimentBucketsSchema,
  distribution: sentimentBucketsSchema,
  average_scores: sentimentScoresSchema,
  total: z.number(),
});
export type CommentSentimentInsights = z.infer<typeof commentSentimentInsightsSchema>;

export const videoInsightsBlockSchema = z.object({
  clickbait: clickbaitInsightsSchema,
  transcript_sentiment: transcriptSentimentInsightsSchema,
  comment_sentiment: commentSentimentInsightsSchema,
});
export type VideoInsightsBlock = z.infer<typeof videoInsightsBlockSchema>;
