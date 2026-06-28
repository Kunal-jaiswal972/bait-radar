import { getEventHubProducer } from "../clients/eventHubClient";
import type { VideoIngestionMessage } from "../types";

/** Publishes one ingestion message, partitioned by channelId to keep a channel's events ordered. */
export async function publishVideoIngestion(message: VideoIngestionMessage): Promise<void> {
  const client = getEventHubProducer();
  const batch = await client.createBatch({ partitionKey: message.channelId });
  if (!batch.tryAdd({ body: message })) {
    throw new Error("Failed to add message to Event Hub batch");
  }
  await client.sendBatch(batch);
}
