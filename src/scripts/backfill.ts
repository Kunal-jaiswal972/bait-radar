// Dev utility: pushes the N most recent uploads of every tracked channel through
// the ingestion pipeline (the same Event Hub path the webhook uses), so there is
// data to analyze without waiting for brand-new uploads.
//
// Usage:  bun run src/scripts/backfill.ts [countPerChannel] [onlyChannelId]
//   countPerChannel  recent uploads per channel (default 3)
//   onlyChannelId    optional — restrict to a single channel id
//
// Reads env from local.settings.json (the Functions host isn't running here), so
// it works the same way `func start` would locally.

import { readFileSync } from "node:fs";
import path from "node:path";

// Load local.settings.json "Values" into process.env before anything reads env().
function loadLocalSettings(): void {
  try {
    const file = path.join(process.cwd(), "local.settings.json");
    const settings = JSON.parse(readFileSync(file, "utf-8")) as { Values?: Record<string, string> };
    for (const [key, value] of Object.entries(settings.Values ?? {})) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (err) {
    console.warn("Could not load local.settings.json (relying on existing env):", err);
  }
}

loadLocalSettings();

// Imported after env is populated so module-level singletons see the right config.
const { channelRepository } = await import("../db/repositories");
const { getRecentUploads } = await import("../services/videoService");
const { publishVideoIngestion, publishCommentProcessing } = await import(
  "../services/ingestionService"
);

async function main(): Promise<void> {
  const count = Number(process.argv[2] ?? 3);
  const onlyChannelId = process.argv[3];
  const logger = { log: console.log, warn: console.warn };

  let channels = await channelRepository.query("SELECT * FROM c", logger);
  if (onlyChannelId) channels = channels.filter((c) => c.channelId === onlyChannelId);
  if (channels.length === 0) {
    console.log(
      onlyChannelId
        ? `Channel ${onlyChannelId} not found in the Channels container. Register it first via POST /api/channels.`
        : "No channels in the Channels container. Register one first via POST /api/channels."
    );
    return;
  }

  console.log(`Backfilling ${count} recent upload(s) for ${channels.length} channel(s)...`);
  let published = 0;

  for (const channel of channels) {
    try {
      const videoIds = await getRecentUploads(channel.channelId, count);
      console.log(`  ${channel.channelId} (${channel.title ?? "?"}): ${videoIds.length} video(s)`);
      for (const videoId of videoIds) {
        const message = { videoId, channelId: channel.channelId, source: "backfill" as const };
        // Seed both stages so local runs get full data now (no 6h wait): content
        // stage builds the doc; comment stage merges the top-100 comments into it.
        await publishVideoIngestion(message);
        await publishCommentProcessing(message);
        published++;
      }
    } catch (err) {
      console.error(`  Failed to backfill channel ${channel.channelId}:`, err);
    }
  }

  console.log(`Done. Published ${published} video(s) to both the ingestion and comment queues.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
