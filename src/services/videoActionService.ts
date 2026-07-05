import { videoInsightsRepository } from "../db/repositories";
import { publishCommentProcessing } from "./ingestionService";
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
 * Manual refresh: re-run the comment stage on demand (source: "manual_refresh").
 * That refetches the top-100 comments, recomputes sentiment + betrayal + the
 * merged score + channel rollup, and appends a fresh stats snapshot — the escape
 * hatch to re-pull comments for any video regardless of age or the 6h/48h windows.
 * Packaging/mismatch (Gemini/Vision) are left as-is. Returns false when the video
 * isn't tracked yet.
 */
export async function refreshVideo(videoId: string, logger: Logger): Promise<boolean> {
  const location = await findVideoLocation(videoId);
  if (!location) return false;

  await publishCommentProcessing({
    videoId: location.id,
    channelId: location.channelId,
    source: "manual_refresh",
  });
  logger.log(`Re-enqueued ${videoId} for manual comment refresh`);
  return true;
}
