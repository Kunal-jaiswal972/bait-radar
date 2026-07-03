import { app, InvocationContext, Timer } from "@azure/functions";
import { publishVideoIngestion } from "../../services/ingestionService";
import { videoInsightsRepository } from "../../db/repositories";

// Videos published within this window are refreshed on every run.
const TRACKING_WINDOW_HOURS = 48;

interface RecentVideoRow {
  id: string; // == videoId
  channelId: string;
  publishedAt: string;
}

/**
 * Hourly time-series tracker (Phase 5). Finds videos published in the last
 * TRACKING_WINDOW_HOURS and re-enqueues each through the same ingestion pipeline
 * the webhook uses. The worker then re-fetches stats + comments, recomputes
 * comment sentiment + the clickbait score, appends a fresh `timeline` point, and
 * preserves the existing transcript if a re-fetch returns nothing — so engagement
 * is tracked over time without duplicating or losing prior data.
 */
export async function timeSeriesTracker(_timer: Timer, context: InvocationContext): Promise<void> {
  const cutoff = new Date(Date.now() - TRACKING_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const rows = await videoInsightsRepository.queryProjection<RecentVideoRow>({
    query: "SELECT c.id, c.channelId, c.publishedAt FROM c WHERE c.publishedAt >= @cutoff",
    parameters: [{ name: "@cutoff", value: cutoff }],
  });

  context.log(`Time-series tracker: ${rows.length} video(s) published since ${cutoff}`);

  let enqueued = 0;
  for (const row of rows) {
    try {
      await publishVideoIngestion({
        videoId: row.id,
        channelId: row.channelId,
        publishedAt: row.publishedAt,
        source: "tracker",
      });
      enqueued++;
    } catch (err) {
      context.warn(`Tracker: failed to re-enqueue ${row.id}`, err);
    }
  }

  context.log(`Time-series tracker: re-enqueued ${enqueued}/${rows.length} video(s) for refresh`);
}

app.timer("timeSeriesTracker", {
  // NCRONTAB (sec min hour day month day-of-week): every hour, on the hour.
  schedule: "0 0 * * * *",
  handler: timeSeriesTracker,
});
