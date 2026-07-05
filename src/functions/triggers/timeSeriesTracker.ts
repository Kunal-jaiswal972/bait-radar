import { app, InvocationContext, Timer } from "@azure/functions";
import { appendVideoStats } from "../../services/videoTrackingService";
import { videoInsightsRepository } from "../../db/repositories";

// Videos published within this window get a fresh stats snapshot on every run.
const TRACKING_WINDOW_HOURS = 48;

interface RecentVideoRow {
  id: string; // == videoId
  channelId: string;
}

/**
 * Stats-only time-series tracker. Every 6 hours it appends a views/likes/comments
 * snapshot to the timeline for videos published in the last TRACKING_WINDOW_HOURS
 * — enough to draw the engagement curve while a video is fresh, with no AI cost.
 * Comment analysis + rescoring is NOT done here; that's the comment stage (fired
 * once ~6h after upload by commentAnalysisScheduler, or manually).
 */
export async function timeSeriesTracker(_timer: Timer, context: InvocationContext): Promise<void> {
  const cutoff = new Date(Date.now() - TRACKING_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const rows = await videoInsightsRepository.queryProjection<RecentVideoRow>({
    query: "SELECT c.id, c.channelId FROM c WHERE c.publishedAt >= @cutoff",
    parameters: [{ name: "@cutoff", value: cutoff }],
  });

  context.log(`Stats tracker: ${rows.length} video(s) published since ${cutoff}`);

  let updated = 0;
  for (const row of rows) {
    try {
      if (await appendVideoStats({ videoId: row.id, channelId: row.channelId }, context)) updated++;
    } catch (err) {
      context.warn(`Stats tracker: failed to snapshot ${row.id}`, err);
    }
  }

  context.log(`Stats tracker: appended ${updated}/${rows.length} snapshot(s)`);
}

app.timer("timeSeriesTracker", {
  // NCRONTAB (sec min hour day month day-of-week): every 6 hours, on the hour.
  schedule: "0 0 */6 * * *",
  handler: timeSeriesTracker,
});
