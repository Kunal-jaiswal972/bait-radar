import { QueueClient } from "@azure/storage-queue";
import { env } from "../config/env";

// Storage Queue client singletons, reused across warm invocations. Both queues
// live on the Function App's own storage account (AzureWebJobsStorage) — no extra
// broker to pay for (this replaces the always-on Event Hub namespace).
let ingestionClient: QueueClient | undefined;
let commentClient: QueueClient | undefined;

/** Queue for the video (content) stage: metadata / transcript / packaging. */
export function getIngestionQueue(): QueueClient {
  if (!ingestionClient) {
    const e = env();
    ingestionClient = new QueueClient(e.AzureWebJobsStorage, e.INGESTION_QUEUE_NAME);
  }
  return ingestionClient;
}

/** Queue for the comment stage: top-100 comments + sentiment + betrayal. */
export function getCommentProcessingQueue(): QueueClient {
  if (!commentClient) {
    const e = env();
    commentClient = new QueueClient(e.AzureWebJobsStorage, e.COMMENT_QUEUE_NAME);
  }
  return commentClient;
}
