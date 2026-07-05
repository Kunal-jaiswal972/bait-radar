import { z } from "zod";

// Storage Queue message — a queue trust boundary, so Zod-validated on read. The
// same shape flows through both the video-ingestion queue (metadata/transcript/
// packaging) and the comment-processing queue (top-100 comments + betrayal).
export const videoIngestionMessageSchema = z.object({
  videoId: z.string().min(1),
  channelId: z.string().min(1),
  publishedAt: z.string().optional(),
  source: z.enum(["webhook", "manual_refresh", "backfill", "scheduled_comments"]),
});

export type VideoIngestionMessage = z.infer<typeof videoIngestionMessageSchema>;
