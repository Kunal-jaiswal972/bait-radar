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
export const channelSchema = z.object({
  id: z.string(), // == channelId (partition key)
  channelId: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  topicUrl: z.string(), // YouTube feed URL used as the PubSubHubbub topic
  hubSubscriptionStatus: hubSubscriptionStatusSchema,
  clickbait: channelClickbaitSchema.optional(), // populated once the channel has analyzed videos
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Channel = z.infer<typeof channelSchema>;
