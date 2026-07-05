// One-time migration for the comment-decoupling + Vision-removal change.
//
// For every existing VideoInsights document it:
//   • stamps `comments_processed_at` (so the comment scheduler treats the doc's
//     existing comments as already analyzed and never re-enqueues it), and
//   • rewrites the doc through the current schema — which drops the now-removed
//     `thumbnail` block (Vision) and fills in `betrayal.available`.
//
// The rewrite is implicit: the repository validates on read (stripping unknown
// keys, applying the betrayal transform), so upserting the read-back document
// persists the new shape. Existing comments are preserved and NOT re-scored.
//
// Usage:  bun run src/scripts/migrate.ts [--dry]
//   --dry   report what would change without writing

import { readFileSync } from "node:fs";
import path from "node:path";

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

const { videoInsightsRepository } = await import("../db/repositories");

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const logger = { log: console.log, warn: console.warn };

  const videos = await videoInsightsRepository.query("SELECT * FROM c", logger);
  console.log(`Found ${videos.length} video document(s). ${dry ? "(dry run)" : ""}`);

  let stamped = 0;
  let rewritten = 0;

  for (const doc of videos) {
    const alreadyStamped = Boolean(doc.comments_processed_at);
    if (!alreadyStamped) {
      const lastPoint = doc.timeline[doc.timeline.length - 1];
      doc.comments_processed_at = lastPoint?.timestamp ?? doc.publishedAt ?? new Date().toISOString();
      stamped++;
    }

    if (dry) continue;

    // Upserting the validated doc persists the current shape (thumbnail dropped,
    // betrayal.available set) even when comments_processed_at was already present.
    await videoInsightsRepository.upsert(doc);
    rewritten++;
  }

  console.log(
    dry
      ? `Would stamp comments_processed_at on ${stamped} doc(s) and rewrite all ${videos.length}.`
      : `Done. Stamped ${stamped} doc(s), rewrote ${rewritten} to the new schema.`
  );
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
