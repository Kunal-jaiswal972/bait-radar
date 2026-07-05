import { app, InvocationContext, Timer } from "@azure/functions";
import { publishCommentProcessing } from "../../services/ingestionService";
import { videoInsightsRepository } from "../../db/repositories";

// A video's comments are analyzed once, this long after upload — by then the
// major audience response has landed and engagement has largely stagnated.
const COMMENT_DELAY_HOURS = 6;
// Don't reach back past this: older un-analyzed videos (e.g. pre-existing ones)
// stay comment-only-on-demand rather than triggering a bulk backfill.
const TRACKING_WINDOW_HOURS = 48;

interface RecentVideoRow {
  id: string; // == videoId
  channelId: string;
  publishedAt: string;
}

/**
 * Hourly scan that fires the one-time comment stage. Enqueues any video whose
 * upload is between COMMENT_DELAY_HOURS and TRACKING_WINDOW_HOURS old and hasn't
 * had comments analyzed yet (comments_processed_at unset). Once the comment stage
 * stamps that field the video is never re-enqueued here — further refreshes are
 * manual only.
 */
export async function commentAnalysisScheduler(
  _timer: Timer,
  context: InvocationContext
): Promise<void> {
  const now = Date.now();
  const readyBefore = new Date(now - COMMENT_DELAY_HOURS * 60 * 60 * 1000).toISOString();
  const windowStart = new Date(now - TRACKING_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const rows = await videoInsightsRepository.queryProjection<RecentVideoRow>({
    query:
      "SELECT c.id, c.channelId, c.publishedAt FROM c " +
      "WHERE c.publishedAt <= @readyBefore AND c.publishedAt >= @windowStart " +
      "AND (NOT IS_DEFINED(c.comments_processed_at))",
    parameters: [
      { name: "@readyBefore", value: readyBefore },
      { name: "@windowStart", value: windowStart },
    ],
  });

  context.log(`Comment scheduler: ${rows.length} video(s) ready for their one-time comment pass`);

  let enqueued = 0;
  for (const row of rows) {
    try {
      await publishCommentProcessing({
        videoId: row.id,
        channelId: row.channelId,
        publishedAt: row.publishedAt,
        source: "scheduled_comments",
      });
      enqueued++;
    } catch (err) {
      context.warn(`Comment scheduler: failed to enqueue ${row.id}`, err);
    }
  }

  context.log(`Comment scheduler: enqueued ${enqueued}/${rows.length} video(s)`);
}

app.timer("commentAnalysisScheduler", {
  // NCRONTAB (sec min hour day month day-of-week): every hour, on the hour.
  schedule: "0 0 * * * *",
  handler: commentAnalysisScheduler,
});
