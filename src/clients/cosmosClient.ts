import { Container, CosmosClient, Database } from "@azure/cosmos";
import { env } from "../config/env";

const PARTITION_KEY = "/channelId";

let client: CosmosClient | undefined;
let database: Database | undefined;
const containerCache = new Map<string, Container>();

function getClient(): CosmosClient {
  if (!client) {
    client = new CosmosClient(env().COSMOS_CONNECTION_STRING);
  }
  return client;
}

async function getDatabase(): Promise<Database> {
  if (!database) {
    const { database: db } = await getClient().databases.createIfNotExists({
      id: env().COSMOS_DATABASE,
    });
    database = db;
  }
  return database;
}

/**
 * Returns a container, creating the database/container on first use. Cached
 * per-process so warm invocations are cheap. All containers partition on
 * /channelId.
 */
export async function getContainer(containerId: string): Promise<Container> {
  const cached = containerCache.get(containerId);
  if (cached) return cached;

  const db = await getDatabase();
  const { container } = await db.containers.createIfNotExists({
    id: containerId,
    partitionKey: { paths: [PARTITION_KEY] },
  });
  containerCache.set(containerId, container);
  return container;
}

export const Containers = {
  Channels: "Channels",
  VideoInsights: "VideoInsights",
} as const;
