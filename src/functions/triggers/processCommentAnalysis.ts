import { app, InvocationContext } from "@azure/functions";
import { processCommentsForVideo } from "../../services/videoTrackingService";
import { videoIngestionMessageSchema } from "../../types";

// Storage Queue payloads are base64-decoded by the runtime; a JSON body arrives
// either already parsed (object) or as a string we parse here.
function decodeMessage(queueItem: unknown): unknown {
  if (typeof queueItem === "string") {
    try {
      return JSON.parse(queueItem);
    } catch {
      return queueItem;
    }
  }
  return queueItem;
}

/**
 * Comment stage. Triggered on the comment-processing queue by the scheduler
 * (~6h after upload, once) and by the manual refresh action. Fetches the top-100
 * comments, scores sentiment + betrayal, and recomputes every dependent score.
 */
export async function processCommentAnalysis(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const parsed = videoIngestionMessageSchema.safeParse(decodeMessage(queueItem));
  if (!parsed.success) {
    context.warn("Skipping malformed comment-processing message", queueItem);
    return;
  }

  const { videoId, channelId } = parsed.data;
  try {
    await processCommentsForVideo({ videoId, channelId }, context);
  } catch (err) {
    // Re-throw so the queue re-delivers transient failures (YouTube/Language 5xx).
    context.error(`Comment stage failed for ${videoId}`, err);
    throw err;
  }
}

app.storageQueue("processCommentAnalysis", {
  queueName: "%COMMENT_QUEUE_NAME%",
  connection: "AzureWebJobsStorage",
  handler: processCommentAnalysis,
});
