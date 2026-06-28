import { z } from "zod";

// video-ingestion-hub message — a queue trust boundary, so Zod-validated on read.
export const videoIngestionMessageSchema = z.object({
  videoId: z.string().min(1),
  channelId: z.string().min(1),
  publishedAt: z.string().optional(),
  source: z.enum(["webhook", "manual_refresh"]),
});

export type VideoIngestionMessage = z.infer<typeof videoIngestionMessageSchema>;
