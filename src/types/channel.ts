// Channels container document. Zod-sourced so it can be validated when read
// back from Cosmos (guards against schema drift).

import { z } from "zod";

export const hubSubscriptionStatusSchema = z.enum(["pending", "verified", "failed"]);
export type HubSubscriptionStatus = z.infer<typeof hubSubscriptionStatusSchema>;

export const channelSchema = z.object({
  id: z.string(), // == channelId (partition key)
  channelId: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  topicUrl: z.string(), // YouTube feed URL used as the PubSubHubbub topic
  hubSubscriptionStatus: hubSubscriptionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Channel = z.infer<typeof channelSchema>;
