import { z } from "zod";
import { sentimentSchema, sentimentScoresSchema, transcriptStatusSchema } from "./common";
import { videoInsightsBlockSchema } from "./insights";

// VideoInsights container document and its sub-shapes. Zod-sourced so the whole
// doc can be validated when read back from Cosmos (guards against schema drift).

export const transcriptSegmentSchema = z.object({
  text: z.string(),
  start: z.number(),
  duration: z.number(),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const videoMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  channelTitle: z.string().default(""),
  thumbnailUrl: z.string(),
  videoUrl: z.string(),
  duration: z.string().default(""), // ISO 8601, e.g. "PT10M30S"
  transcript_status: transcriptStatusSchema,
  transcript: z.array(transcriptSegmentSchema),
});
export type VideoMetadata = z.infer<typeof videoMetadataSchema>;

// One aspect-based opinion from Azure AI Language Opinion Mining: a target
// (e.g. "the thumbnail") and the sentiment expressed toward it.
export const opinionSchema = z.object({
  target: z.string(),
  sentiment: sentimentSchema,
});
export type Opinion = z.infer<typeof opinionSchema>;

export const commentRecordSchema = z.object({
  id: z.string().optional(), // YouTube comment id, used for dedupe during tracking
  author: z.string(),
  text: z.string(),
  sentiment: sentimentSchema,
  confidence: sentimentScoresSchema.optional(),
  opinions: z.array(opinionSchema).default([]), // aspect-based opinions (opinion mining)
  timestamp: z.string(),
});
export type CommentRecord = z.infer<typeof commentRecordSchema>;

/** One snapshot in the engagement-velocity time series. */
export const timelinePointSchema = z.object({
  timestamp: z.string(),
  views: z.number(),
  likes: z.number().default(0),
  comments: z.number().default(0),
  aggregate_sentiment: z.object({
    positive: z.number(),
    negative: z.number(),
    neutral: z.number(),
  }),
});
export type TimelinePoint = z.infer<typeof timelinePointSchema>;

export const videoInsightsSchema = z.object({
  id: z.string(), // == videoId
  channelId: z.string(), // partition key
  publishedAt: z.string(),
  metadata: videoMetadataSchema,
  insights: videoInsightsBlockSchema,
  comments: z.array(commentRecordSchema),
  timeline: z.array(timelinePointSchema),
  // Set once the ~6h comment pass runs. Gates the scheduler (fire-once) and the
  // dashboard's "comments pending" state; absent means comments not yet analyzed.
  comments_processed_at: z.string().optional(),
});
export type VideoInsights = z.infer<typeof videoInsightsSchema>;
