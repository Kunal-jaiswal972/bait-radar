import { QueueClient } from "@azure/storage-queue";
import { getCommentProcessingQueue, getIngestionQueue } from "../clients/queueClient";
import type { VideoIngestionMessage } from "../types";

const ensured = new WeakSet<QueueClient>();

// The Functions queue trigger expects base64-encoded payloads by default, so the
// JSON is encoded here; the runtime decodes + JSON-parses it back for the handler.
async function publish(queue: QueueClient, message: VideoIngestionMessage): Promise<void> {
  if (!ensured.has(queue)) {
    await queue.createIfNotExists(); // idempotent safety net (Terraform creates it)
    ensured.add(queue);
  }
  const payload = Buffer.from(JSON.stringify(message), "utf-8").toString("base64");
  await queue.sendMessage(payload);
}

/** Enqueue the video (content) stage: metadata / transcript / packaging. */
export async function publishVideoIngestion(message: VideoIngestionMessage): Promise<void> {
  await publish(getIngestionQueue(), message);
}

/** Enqueue the comment stage: top-100 comments + sentiment + betrayal + rescore. */
export async function publishCommentProcessing(message: VideoIngestionMessage): Promise<void> {
  await publish(getCommentProcessingQueue(), message);
}
