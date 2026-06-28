// Primitive shared types. The enums/scores are Zod-sourced because they appear
// in validated persisted documents; types are inferred from the schemas.

import { z } from "zod";

export const transcriptStatusSchema = z.enum([
  "success",
  "failed_retryable",
  "manual_override",
]);
export type TranscriptStatus = z.infer<typeof transcriptStatusSchema>;

export const sentimentSchema = z.enum(["Positive", "Negative", "Neutral", "Mixed"]);
export type Sentiment = z.infer<typeof sentimentSchema>;

export const clickbaitLabelSchema = z.enum([
  "Not Clickbait",
  "Mildly Clickbait",
  "Likely Clickbait",
  "Highly Clickbait",
]);
export type ClickbaitLabel = z.infer<typeof clickbaitLabelSchema>;

// Azure AI Language per-document confidence scores (0..1).
export const sentimentScoresSchema = z.object({
  positive: z.number(),
  neutral: z.number(),
  negative: z.number(),
});
export type SentimentScores = z.infer<typeof sentimentScoresSchema>;

// Minimal logger so services can report without depending on the Functions SDK.
export interface Logger {
  log: (msg: string) => void;
  warn: (msg: string, err?: unknown) => void;
}
