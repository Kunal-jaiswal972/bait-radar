import { videoInsightsRepository } from "../db/repositories";
import { publishVideoIngestion } from "./ingestionService";
import type { Logger } from "../types";

// Write-back workflows for the dashboard (Phase 6): on-demand refresh. Kept
// separate from the read-only dashboardService so each owns a single responsibility.

interface VideoLocation {
  id: string; // == videoId
  channelId: string; // partition key
}

/** Resolves a video's channelId (partition key) from its id; null if unknown. */
async function findVideoLocation(videoId: string): Promise<VideoLocation | null> {
  const rows = await videoInsightsRepository.queryProjection<VideoLocation>({
    query: "SELECT c.id, c.channelId FROM c WHERE c.id = @id",
    parameters: [{ name: "@id", value: videoId }],
  });
  return rows?.[0] ?? null;
}

/**
 * Re-runs extraction + AI for a video on demand by republishing it to the same
 * ingestion hub the webhook uses (source: "manual_refresh"). The worker merges
 * with the existing document, so this also appends a fresh timeline point for any
 * video — the manual escape hatch for the tracker's 48h window. Returns false when
 * the video isn't tracked yet.
 */
export async function refreshVideo(videoId: string, logger: Logger): Promise<boolean> {
  const location = await findVideoLocation(videoId);
  if (!location) return false;

  await publishVideoIngestion({
    videoId: location.id,
    channelId: location.channelId,
    source: "manual_refresh",
  });
  logger.log(`Re-enqueued ${videoId} for manual refresh`);
  return true;
}
