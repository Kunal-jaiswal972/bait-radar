// video-ingestion-hub message. Defined as a Zod schema (a queue trust boundary)
// with the TS type inferred from it.

import { z } from "zod";

export const videoIngestionMessageSchema = z.object({
  videoId: z.string().min(1),
  channelId: z.string().min(1),
  publishedAt: z.string().optional(),
  source: z.enum(["webhook", "manual_refresh"]),
});

export type VideoIngestionMessage = z.infer<typeof videoIngestionMessageSchema>;
