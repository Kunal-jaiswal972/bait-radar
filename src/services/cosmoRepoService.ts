import type { SqlQuerySpec } from "@azure/cosmos";
import { z } from "zod";
import type { Logger } from "../types";
import { getContainer } from "../clients/cosmosClient";

export interface Repository<T> {
  read(id: string, partitionKey: string, logger?: Logger): Promise<T | undefined>;
  upsert(doc: T): Promise<void>;
  query(query: string | SqlQuerySpec, logger?: Logger): Promise<T[]>;
}

/**
 * Binds a Cosmos container to a Zod schema so every read and query is validated
 * centrally. Consumers never re-implement validation; documents that fail
 * (schema drift) are logged and skipped.
 */
export function createRepository<S extends z.ZodTypeAny>(
  containerId: string,
  schema: S
): Repository<z.infer<S>> {
  type T = z.infer<S>;

  function validate(resource: unknown, logger?: Logger): T | undefined {
    const parsed = schema.safeParse(resource);
    if (parsed.success) return parsed.data;
    logger?.warn(
      `Doc in '${containerId}' failed schema validation (drift?): ` +
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
    return undefined;
  }

  return {
    async read(id, partitionKey, logger) {
      const container = await getContainer(containerId);
      try {
        const { resource } = await container.item(id, partitionKey).read();
        return resource ? validate(resource, logger) : undefined;
      } catch {
        return undefined;
      }
    },

    async upsert(doc) {
      const container = await getContainer(containerId);
      await container.items.upsert(doc);
    },

    async query(query, logger) {
      const container = await getContainer(containerId);
      const { resources } = await container.items.query(query).fetchAll();
      return resources
        .map((r) => validate(r, logger))
        .filter((r): r is T => r !== undefined);
    },
  };
}
