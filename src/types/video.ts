// VideoInsights container document and its sub-shapes. Zod-sourced so the doc
// can be validated when read back from Cosmos (guards against schema drift).

import { z } from "zod";
import { sentimentSchema, sentimentScoresSchema, transcriptStatusSchema } from "./common";
import { videoInsightsBlockSchema } from "./insights";

export const transcriptSegmentSchema = z.object({
  text: z.string(),
  start: z.number(),
  duration: z.number(),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

// The video's own data.
export const videoMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  thumbnailUrl: z.string(),
  videoUrl: z.string(),
  transcript_status: transcriptStatusSchema,
  transcript: z.array(transcriptSegmentSchema),
});
export type VideoMetadata = z.infer<typeof videoMetadataSchema>;

export const commentRecordSchema = z.object({
  id: z.string().optional(), // YouTube comment id, used for dedupe during tracking
  author: z.string(),
  text: z.string(),
  sentiment: sentimentSchema,
  confidence: sentimentScoresSchema.optional(),
  timestamp: z.string(),
});
export type CommentRecord = z.infer<typeof commentRecordSchema>;

// One snapshot in the engagement-velocity time series.
export const timelinePointSchema = z.object({
  timestamp: z.string(),
  views: z.number(),
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
});
export type VideoInsights = z.infer<typeof videoInsightsSchema>;
