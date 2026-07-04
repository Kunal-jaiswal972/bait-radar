import { z } from "zod";

// Primitive shared types. Enums/scores are Zod-sourced because they appear in
// validated persisted documents; their TS types are inferred from the schemas.

export const transcriptStatusSchema = z.enum([
  "success",
  "failed_retryable",
]);
export type TranscriptStatus = z.infer<typeof transcriptStatusSchema>;

export const sentimentSchema = z.enum(["Positive", "Negative", "Neutral", "Mixed"]);
export type Sentiment = z.infer<typeof sentimentSchema>;

// 5-level clickbait likelihood the dashboard renders from clickbait_percentage.
export const likelihoodSchema = z.enum([
  "Least Likely",
  "Less Likely",
  "Normal",
  "Highly Likely",
  "Most Likely",
]);
export type Likelihood = z.infer<typeof likelihoodSchema>;

/** Azure AI Language per-document confidence scores (0..1). */
export const sentimentScoresSchema = z.object({
  positive: z.number(),
  neutral: z.number(),
  negative: z.number(),
});
export type SentimentScores = z.infer<typeof sentimentScoresSchema>;

/** Minimal logger so services can report without depending on the Functions SDK. */
export interface Logger {
  log: (msg: string) => void;
  warn: (msg: string, err?: unknown) => void;
}
