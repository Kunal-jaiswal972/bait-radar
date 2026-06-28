import { Containers } from "../clients/cosmosClient";
import { createRepository } from "../services/cosmoRepoService";
import { channelSchema, videoInsightsSchema } from "../types";

// Schema map for the data layer: each container is bound to its validation
// schema here, so reads/queries through these repositories are validated
// automatically. Adding a table is one line.
export const channelRepository = createRepository(Containers.Channels, channelSchema);
export const videoInsightsRepository = createRepository(
  Containers.VideoInsights,
  videoInsightsSchema
);
