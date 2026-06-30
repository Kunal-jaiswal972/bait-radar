import type { SqlQuerySpec } from "@azure/cosmos";
import { channelRepository, videoInsightsRepository } from "../db/repositories";
import { toChannelSummary, toVideoCard, toVideoDetail } from "../domain/dashboardMappers";
import type { ChannelSummary, Logger, VideoCard, VideoDetail } from "../types";

// Read-only dashboard workflows: query the repositories, then map persisted
// documents to the user-facing DTOs via the pure domain mappers.

export interface ListVideosParams {
  channelId?: string;
  limit: number;
  offset: number;
}

/** All tracked channels, newest first, as summaries with rollups. */
export async function listChannels(logger?: Logger): Promise<ChannelSummary[]> {
  const channels = await channelRepository.query("SELECT * FROM c ORDER BY c.createdAt DESC", logger);
  return channels.map(toChannelSummary);
}

/** Recent analyzed videos as cards, optionally filtered to one channel. */
export async function listVideos(
  params: ListVideosParams,
  logger?: Logger
): Promise<VideoCard[]> {
  const { channelId, limit, offset } = params;
  const where = channelId ? "WHERE c.channelId = @channelId" : "";
  const parameters: SqlQuerySpec["parameters"] = [
    { name: "@offset", value: offset },
    { name: "@limit", value: limit },
  ];
  if (channelId) parameters.push({ name: "@channelId", value: channelId });

  const query: SqlQuerySpec = {
    query: `SELECT * FROM c ${where} ORDER BY c.publishedAt DESC OFFSET @offset LIMIT @limit`,
    parameters,
  };
  const videos = await videoInsightsRepository.query(query, logger);
  return videos.map(toVideoCard);
}

/** Full per-video detail by id (cross-partition lookup); undefined if missing. */
export async function getVideoDetail(
  videoId: string,
  logger?: Logger
): Promise<VideoDetail | undefined> {
  const query: SqlQuerySpec = {
    query: "SELECT * FROM c WHERE c.id = @id",
    parameters: [{ name: "@id", value: videoId }],
  };
  const matches = await videoInsightsRepository.query(query, logger);
  const doc = matches?.[0];
  return doc ? toVideoDetail(doc) : undefined;
}
