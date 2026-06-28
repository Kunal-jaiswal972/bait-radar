import { z } from "zod";
import { clickbaitLabelSchema, sentimentSchema, sentimentScoresSchema } from "./common";

/** Identical evidence fed to both clickbait scorers (heuristic + LLM). Internal-only, never persisted. */
export interface ClickbaitSignals {
  title: string;
  description: string;
  tags: string[];
  objects: string[];
  thumbnailText: string[]; // OCR text overlays
}

/** Raw Azure AI Vision output for the thumbnail. */
export const thumbnailInsightsSchema = z.object({
  ocr_text: z.array(z.string()),
  tags: z.array(z.string()),
  objects: z.array(z.string()),
});
export type ThumbnailInsights = z.infer<typeof thumbnailInsightsSchema>;

/** Clickbait scores + their human-readable labels. */
export const clickbaitInsightsSchema = z.object({
  heuristic_score: z.number(),
  heuristic_label: clickbaitLabelSchema,
  llm_score: z.number(),
  llm_label: clickbaitLabelSchema,
  llm_source: z.string(),
  weighted_score: z.number(),
  max_score: z.number(),
  max_label: clickbaitLabelSchema,
  verdict: clickbaitLabelSchema,
  is_clickbait: z.boolean(),
});
export type ClickbaitInsights = z.infer<typeof clickbaitInsightsSchema>;

/** Sentiment of the first N seconds of the transcript. */
export const transcriptSentimentInsightsSchema = z.object({
  label: sentimentSchema,
  window_seconds: z.number(),
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
  thumbnail: thumbnailInsightsSchema,
  clickbait: clickbaitInsightsSchema,
  transcript_sentiment: transcriptSentimentInsightsSchema,
  comment_sentiment: commentSentimentInsightsSchema,
});
export type VideoInsightsBlock = z.infer<typeof videoInsightsBlockSchema>;
