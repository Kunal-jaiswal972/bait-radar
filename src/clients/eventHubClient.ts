// Event Hub producer singleton, reused across warm invocations.

import { EventHubProducerClient } from "@azure/event-hubs";
import { env } from "../config/env";

let producer: EventHubProducerClient | undefined;

export function getEventHubProducer(): EventHubProducerClient {
  if (!producer) {
    const e = env();
    producer = new EventHubProducerClient(e.EVENTHUB_CONNECTION_STRING, e.EVENTHUB_NAME);
  }
  return producer;
}
