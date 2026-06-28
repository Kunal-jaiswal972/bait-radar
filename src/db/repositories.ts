// Central registry binding each Cosmos container to its validation schema.
// This is the data-layer "schema map": adding a table is one line here.
// Reads/queries through these repositories are validated automatically.

import { Containers } from "../clients/cosmosClient";
import { createRepository } from "../services/cosmoRepoService";
import { channelSchema, videoInsightsSchema } from "../types";

export const channelRepository = createRepository(Containers.Channels, channelSchema);
export const videoInsightsRepository = createRepository(
  Containers.VideoInsights,
  videoInsightsSchema
);
