import { z } from "zod";
import { likelihoodSchema } from "./common";

export const hubSubscriptionStatusSchema = z.enum(["pending", "verified", "failed"]);
export type HubSubscriptionStatus = z.infer<typeof hubSubscriptionStatusSchema>;

// Channel-level clickbait propensity, aggregated from the channel's videos.
export const channelClickbaitSchema = z.object({
  propensity_percentage: z.number(), // recency-weighted mean of video percentages
  likelihood: likelihoodSchema,
  flagged_pct: z.number(), // fraction of videos scoring as clickbait
  video_count: z.number(),
  avg_betrayal_rate: z.number(),
  trend: z.enum(["rising", "falling", "stable"]),
  updated_at: z.string(),
});
export type ChannelClickbait = z.infer<typeof channelClickbaitSchema>;

// Channels container document. Zod-sourced so it can be validated on Cosmos read.
// The snippet/statistics fields are captured from the YouTube Data API at
// registration time; all optional so a details-fetch failure never blocks save.
export const channelSchema = z.object({
  id: z.string(), // == channelId (partition key)
  channelId: z.string(),
  url: z.string().optional(), // raw registration input, when it was a URL
  title: z.string().optional(),
  description: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  customUrl: z.string().optional(), // canonical "@handle"
  subscriberCount: z.number().optional(),
  videoCount: z.number().optional(),
  viewCount: z.number().optional(),
  country: z.string().optional(),
  channelPublishedAt: z.string().optional(), // when the channel was created
  topicUrl: z.string(), // YouTube feed URL used as the PubSubHubbub topic
  hubSubscriptionStatus: hubSubscriptionStatusSchema,
  clickbait: channelClickbaitSchema.optional(), // populated once the channel has analyzed videos
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Channel = z.infer<typeof channelSchema>;
